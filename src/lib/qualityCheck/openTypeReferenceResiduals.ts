import type opentype from 'opentype.js'
import { isHanCodePoint } from 'src/lib/qualityCheck/hanClassification'
import {
  computeInkMoments,
  flattenContour,
  getPolygonsBounds,
  type GeometryBounds,
  type GeometryPoint,
} from 'src/lib/qualityCheck/polygonGeometry'
import { buildRobustStat } from 'src/lib/qualityCheck/qualityRadar'
import type {
  RadarReferenceData,
  RadarReferenceFeatureKey,
} from 'src/lib/qualityCheck/qualityRadar'
import {
  buildSidesFromPolygons,
  type StructureSides,
} from 'src/lib/qualityCheck/structureMetrics'

const SUPPORTED_REFERENCE_FEATURE_KEYS: RadarReferenceFeatureKey[] = [
  'face:widthRatio',
  'face:heightRatio',
  'balance:centroidX',
  'balance:centroidY',
]

const DEFAULT_ASCENDER_RATIO = 0.88
const MIN_REFERENCE_SAMPLES = 20
const MIN_WINDOW_SIZE = 40
const MAX_WINDOW_SIZE = 150
const WINDOW_STRIDE_DIVISOR = 3
const MIN_FEATURE_SAMPLES = 20
const DEFAULT_REFERENCE_CONFIDENCE = 0.75

interface ReferenceBodyBox {
  top: number
  bottom: number
  unitsPerEm: number
}

interface ReferenceFeature {
  key: RadarReferenceFeatureKey
  value: number
  cohort?: string
}

interface ReferenceSample {
  characters: string[]
  advance: number
  bounds: GeometryBounds
  sides: StructureSides
  centroidX: number
  centroidY: number
  complexity: number
  features: ReferenceFeature[]
}

interface ReferenceWindow {
  centerComplexity: number
  statsByKey: Map<string, { median: number }>
}

export interface OpenTypeReferenceResidualResult {
  data: RadarReferenceData
  sampleCount: number
  entryCount: number
}

const featureStatKey = (feature: ReferenceFeature) =>
  feature.cohort ? `${feature.key}@${feature.cohort}` : feature.key

const commandContours = (commands: opentype.PathCommand[]) => {
  const contours: opentype.PathCommand[][] = []
  let current: opentype.PathCommand[] = []
  for (const command of commands) {
    if (command.type === 'M' && current.length > 0) {
      contours.push(current)
      current = [command]
    } else {
      current.push(command)
    }
  }
  if (current.length > 0) {
    contours.push(current)
  }
  return contours
}

const contourToFlattenNodes = (
  commands: opentype.PathCommand[]
): Parameters<typeof flattenContour>[0] | null => {
  const nodes: Parameters<typeof flattenContour>[0] = []
  let closed = false
  for (const command of commands) {
    if (command.type === 'Z') {
      closed = true
    } else if (command.type === 'M' || command.type === 'L') {
      nodes.push({
        x: command.x ?? 0,
        y: command.y ?? 0,
        kind: 'oncurve',
        segmentType: 'line',
      })
    } else if (command.type === 'Q') {
      nodes.push({
        x: command.x1 ?? 0,
        y: command.y1 ?? 0,
        kind: 'offcurve',
      })
      nodes.push({
        x: command.x ?? 0,
        y: command.y ?? 0,
        kind: 'oncurve',
        segmentType: 'quadratic',
      })
    } else if (command.type === 'C') {
      nodes.push({
        x: command.x1 ?? 0,
        y: command.y1 ?? 0,
        kind: 'offcurve',
      })
      nodes.push({
        x: command.x2 ?? 0,
        y: command.y2 ?? 0,
        kind: 'offcurve',
      })
      nodes.push({
        x: command.x ?? 0,
        y: command.y ?? 0,
        kind: 'oncurve',
        segmentType: 'cubic',
      })
    }
  }
  return closed && nodes.length >= 3 ? nodes : null
}

const getReferenceBodyBox = (font: opentype.Font): ReferenceBodyBox => {
  const unitsPerEm = font.unitsPerEm || 1000
  const top =
    typeof font.ascender === 'number' && Number.isFinite(font.ascender)
      ? font.ascender
      : Math.round(unitsPerEm * DEFAULT_ASCENDER_RATIO)
  const bottom =
    typeof font.descender === 'number' && Number.isFinite(font.descender)
      ? font.descender
      : top - unitsPerEm
  return { top, bottom, unitsPerEm }
}

const collectReferenceFeatures = (
  sample: Omit<ReferenceSample, 'features' | 'complexity'>,
  bodyBox: ReferenceBodyBox,
  semanticEnclosure: boolean
): ReferenceFeature[] => {
  const sideType = (side: keyof StructureSides) =>
    semanticEnclosure ? 'framing' : sample.sides[side].type
  const hFraming =
    (sideType('left') === 'framing' ? 1 : 0) +
    (sideType('right') === 'framing' ? 1 : 0)
  const vFraming =
    (sideType('top') === 'framing' ? 1 : 0) +
    (sideType('bottom') === 'framing' ? 1 : 0)
  const faceWidth = sample.bounds.xMax - sample.bounds.xMin
  const faceHeight = sample.bounds.yMax - sample.bounds.yMin
  const bodyCenterY = (bodyBox.top + bodyBox.bottom) / 2

  return [
    {
      key: 'face:widthRatio',
      value: faceWidth / sample.advance,
      cohort: `h${hFraming}`,
    },
    {
      key: 'face:heightRatio',
      value: faceHeight / bodyBox.unitsPerEm,
      cohort: `v${vFraming}`,
    },
    {
      key: 'balance:centroidX',
      value: (sample.centroidX - sample.advance / 2) / sample.advance,
    },
    {
      key: 'balance:centroidY',
      value: (sample.centroidY - bodyCenterY) / bodyBox.unitsPerEm,
    },
  ]
}

const buildReferenceSamples = (
  font: opentype.Font,
  enclosureCharacters: ReadonlySet<string>
) => {
  const bodyBox = getReferenceBodyBox(font)
  const samples: ReferenceSample[] = []
  const seenCharacters = new Set<string>()

  for (let index = 1; index < font.glyphs.length; index += 1) {
    const glyph = font.glyphs.get(index)
    const characters = [...new Set(glyph.unicodes ?? [])]
      .filter(isHanCodePoint)
      .map((codePoint) => String.fromCodePoint(codePoint))
      .filter((character) => !seenCharacters.has(character))
    if (characters.length === 0 || !glyph.path?.commands?.length) {
      continue
    }

    const polygons = commandContours(glyph.path.commands)
      .map(contourToFlattenNodes)
      .filter((nodes): nodes is Parameters<typeof flattenContour>[0] =>
        Boolean(nodes)
      )
      .map(flattenContour)
      .filter((polygon): polygon is GeometryPoint[] => polygon.length >= 3)
    const bounds = getPolygonsBounds(polygons)
    const moments = computeInkMoments(polygons)
    const advance = glyph.advanceWidth ?? font.unitsPerEm
    if (!bounds || !moments || advance <= 0) {
      continue
    }

    for (const character of characters) {
      seenCharacters.add(character)
    }
    const baseSample = {
      characters,
      advance,
      bounds,
      sides: buildSidesFromPolygons(polygons, bounds, advance, bodyBox),
      centroidX: moments.centroidX,
      centroidY: moments.centroidY,
    }
    const sample: ReferenceSample = {
      ...baseSample,
      complexity: Math.sqrt(Math.max(0, moments.area)) / bodyBox.unitsPerEm,
      features: collectReferenceFeatures(
        baseSample,
        bodyBox,
        characters.some((character) => enclosureCharacters.has(character))
      ),
    }
    samples.push(sample)
  }

  return { bodyBox, samples }
}

const buildReferenceWindows = (
  samples: ReferenceSample[]
): ReferenceWindow[] => {
  const sorted = [...samples].sort(
    (left, right) => left.complexity - right.complexity
  )
  const total = sorted.length
  const windowSize = Math.min(
    total,
    Math.max(MIN_WINDOW_SIZE, Math.min(MAX_WINDOW_SIZE, Math.ceil(total / 3)))
  )
  const stride = Math.max(1, Math.floor(windowSize / WINDOW_STRIDE_DIVISOR))
  const lastStart = total - windowSize
  const windows: ReferenceWindow[] = []

  for (let start = 0; ; start += stride) {
    const windowStart = Math.min(start, lastStart)
    const slice = sorted.slice(windowStart, windowStart + windowSize)
    const complexityStat = buildRobustStat(
      slice.map((sample) => sample.complexity)
    )
    if (complexityStat) {
      const valuesByKey = new Map<string, number[]>()
      for (const sample of slice) {
        for (const feature of sample.features) {
          const key = featureStatKey(feature)
          const values = valuesByKey.get(key) ?? []
          values.push(feature.value)
          valuesByKey.set(key, values)
        }
      }
      const statsByKey = new Map<string, { median: number }>()
      for (const [key, values] of valuesByKey) {
        if (values.length < MIN_FEATURE_SAMPLES) {
          continue
        }
        const stat = buildRobustStat(values)
        if (stat) {
          statsByKey.set(key, { median: stat.median })
        }
      }
      windows.push({
        centerComplexity: complexityStat.median,
        statsByKey,
      })
    }
    if (windowStart >= lastStart) {
      break
    }
  }

  return windows
}

const nearestWindow = (
  windows: ReferenceWindow[],
  complexity: number
): ReferenceWindow => {
  let low = 0
  let high = windows.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (windows[mid].centerComplexity < complexity) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  if (
    low > 0 &&
    complexity - windows[low - 1].centerComplexity <
      windows[low].centerComplexity - complexity
  ) {
    return windows[low - 1]
  }
  return windows[low]
}

const roundResidual = (value: number) => Number(value.toFixed(6))

export const buildRadarReferenceDataFromOpenTypeFont = (
  font: opentype.Font,
  source: string,
  enclosureCharacters: ReadonlySet<string>,
  defaultConfidence = DEFAULT_REFERENCE_CONFIDENCE
): OpenTypeReferenceResidualResult => {
  const { samples } = buildReferenceSamples(font, enclosureCharacters)
  if (samples.length < MIN_REFERENCE_SAMPLES) {
    throw new Error('參考字體中的漢字輪廓不足，無法建立自動建議資料。')
  }

  const windows = buildReferenceWindows(samples)
  const residualsByCharacter: RadarReferenceData['residualsByCharacter'] = {}
  for (const sample of samples) {
    const window = nearestWindow(windows, sample.complexity)
    const residuals: Partial<Record<RadarReferenceFeatureKey, number>> = {}
    for (const feature of sample.features) {
      const stat = window.statsByKey.get(featureStatKey(feature))
      if (stat) {
        residuals[feature.key] = roundResidual(feature.value - stat.median)
      }
    }
    if (Object.keys(residuals).length === 0) {
      continue
    }
    for (const character of sample.characters) {
      residualsByCharacter[character] = residuals
    }
  }

  return {
    data: {
      source,
      defaultConfidence,
      residualsByCharacter,
    },
    sampleCount: samples.length,
    entryCount: Object.keys(residualsByCharacter).length,
  }
}

export const referenceResidualFeatureKeys = SUPPORTED_REFERENCE_FEATURE_KEYS
