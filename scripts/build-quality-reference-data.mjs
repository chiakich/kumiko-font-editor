// Build the static reference-residual dataset used by quality radar.
//
// Usage:
//   node scripts/build-quality-reference-data.mjs [font-path-or-url] [output-json]
//
// By default this downloads Noto Sans CJK TC Regular and writes:
//   public/quality-reference/noto-sans-cjk-tc-regular-radar-residuals.json

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import opentype from 'opentype.js'

const NOTO_SOURCE_URL =
  'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUTPUT_PATH = path.join(
  repoRoot,
  'public',
  'quality-reference',
  'noto-sans-cjk-tc-regular-radar-residuals.json'
)
const GLYPHWIKI_COMPOSITION_PATH = path.join(
  repoRoot,
  'public',
  'glyphwiki',
  'composition.txt'
)

const SUPPORTED_FEATURE_KEYS = [
  'face:widthRatio',
  'face:heightRatio',
  'face:aspect',
  'balance:centroidX',
  'balance:centroidY',
  'ink:toFace',
  'bearing:left',
  'bearing:right',
  'bearing:top',
  'bearing:bottom',
  'gap:x',
  'gap:y',
]

const HAN_RANGES = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x3134f],
]
const ENCLOSURE_PART_CHARS = new Set(['囗', '門', '鬥'])
const GLYPHWIKI_CANVAS = 200
const ENCLOSURE_COVERAGE = 0.6
const DEFAULT_ASCENDER_RATIO = 0.88
const CURVE_FLATTEN_STEPS = 8
const FRAMING_COVERAGE_THRESHOLD = 0.55
const EDGE_BAND_RATIO = 0.018
const MIN_RADAR_SAMPLES = 20
const MIN_WINDOW_SIZE = 40
const MAX_WINDOW_SIZE = 150
const WINDOW_STRIDE_DIVISOR = 3
const DEFAULT_CONFIDENCE = 0.75

const source = process.argv[2] ?? NOTO_SOURCE_URL
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : DEFAULT_OUTPUT_PATH

const isHanCodePoint = (codePoint) =>
  HAN_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)

const loadFontBuffer = async (fontSource) => {
  if (/^https?:\/\//u.test(fontSource)) {
    const response = await fetch(fontSource)
    if (!response.ok) {
      throw new Error(
        `Failed to download ${fontSource}: HTTP ${response.status}`
      )
    }
    return response.arrayBuffer()
  }
  const buffer = readFileSync(fontSource)
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
}

const quantileOf = (sorted, q) => {
  if (sorted.length === 0) {
    return 0
  }
  const position = (sorted.length - 1) * q
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const weight = position - lowerIndex
  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
}

const medianOf = (values) =>
  quantileOf(
    [...values].sort((left, right) => left - right),
    0.5
  )

const buildEnclosureCharacterSet = () => {
  const text = readFileSync(GLYPHWIKI_COMPOSITION_PATH, 'utf-8')
  const minSpan = GLYPHWIKI_CANVAS * ENCLOSURE_COVERAGE
  const result = new Set()
  for (const line of text.split('\n')) {
    const columns = line.split('\t')
    const target = columns[0]
    if (!target || columns.length < 3) {
      continue
    }
    const enclosed = columns.slice(1).some((column) => {
      const [char, coordinateText] = column.split(':')
      const coordinates = (coordinateText ?? '').split(',').map(Number)
      return (
        ENCLOSURE_PART_CHARS.has(char) &&
        coordinates.length === 4 &&
        coordinates.every(Number.isFinite) &&
        coordinates[2] - coordinates[0] >= minSpan &&
        coordinates[3] - coordinates[1] >= minSpan
      )
    })
    if (enclosed) {
      result.add(target)
    }
  }
  return result
}

const commandContours = (commands) => {
  const contours = []
  let current = []
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

const contourToNodes = (commands) => {
  const nodes = []
  let closed = false
  const pushOffCurve = (x, y) => {
    nodes.push({ x, y, kind: 'offcurve' })
  }
  const pushOnCurve = (x, y, segmentType) => {
    nodes.push({ x, y, kind: 'oncurve', segmentType })
  }
  for (const command of commands) {
    if (command.type === 'Z') {
      closed = true
    } else if (command.type === 'M' || command.type === 'L') {
      pushOnCurve(command.x ?? 0, command.y ?? 0, 'line')
    } else if (command.type === 'Q') {
      pushOffCurve(command.x1 ?? 0, command.y1 ?? 0)
      pushOnCurve(command.x ?? 0, command.y ?? 0, 'quadratic')
    } else if (command.type === 'C') {
      pushOffCurve(command.x1 ?? 0, command.y1 ?? 0)
      pushOffCurve(command.x2 ?? 0, command.y2 ?? 0)
      pushOnCurve(command.x ?? 0, command.y ?? 0, 'cubic')
    }
  }
  return closed && nodes.length >= 3 ? nodes : null
}

const toFlattenNodes = (nodes) =>
  nodes.map((node, index) => {
    const nextOnCurve = nodes
      .slice(index + 1)
      .find((candidate) => candidate.kind === 'oncurve')
    return {
      x: node.x,
      y: node.y,
      kind:
        node.kind === 'offcurve'
          ? nextOnCurve?.segmentType === 'quadratic'
            ? 'quad'
            : 'cubic'
          : 'on',
    }
  })

const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const sampleQuadratic = (start, control, end, output) => {
  for (let step = 1; step <= CURVE_FLATTEN_STEPS; step += 1) {
    const t = step / CURVE_FLATTEN_STEPS
    const a = lerp(start, control, t)
    const b = lerp(control, end, t)
    output.push(lerp(a, b, t))
  }
}

const sampleCubic = (start, control1, control2, end, output) => {
  for (let step = 1; step <= CURVE_FLATTEN_STEPS; step += 1) {
    const t = step / CURVE_FLATTEN_STEPS
    const a = lerp(start, control1, t)
    const b = lerp(control1, control2, t)
    const c = lerp(control2, end, t)
    const ab = lerp(a, b, t)
    const bc = lerp(b, c, t)
    output.push(lerp(ab, bc, t))
  }
}

const flattenContour = (nodes) => {
  const flattenNodes = toFlattenNodes(nodes)
  if (flattenNodes.length === 0) {
    return []
  }

  const firstOnIndex = flattenNodes.findIndex((node) => node.kind === 'on')
  const workingNodes =
    firstOnIndex === -1
      ? [
          {
            x: (flattenNodes[0].x + flattenNodes.at(-1).x) / 2,
            y: (flattenNodes[0].y + flattenNodes.at(-1).y) / 2,
            kind: 'on',
          },
          ...flattenNodes,
        ]
      : [
          ...flattenNodes.slice(firstOnIndex),
          ...flattenNodes.slice(0, firstOnIndex),
        ]

  const polygon = [{ x: workingNodes[0].x, y: workingNodes[0].y }]
  let pending = []

  const flushSegment = (end) => {
    const start = polygon.at(-1)
    if (pending.length === 0) {
      polygon.push(end)
    } else if (pending.length === 1) {
      sampleQuadratic(start, pending[0], end, polygon)
    } else if (pending.length === 2 && pending[0].kind === 'cubic') {
      sampleCubic(start, pending[0], pending[1], end, polygon)
    } else {
      let current = start
      for (let index = 0; index < pending.length; index += 1) {
        const control = pending[index]
        const next = pending[index + 1]
        const segmentEnd = next
          ? { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 }
          : end
        sampleQuadratic(current, control, segmentEnd, polygon)
        current = segmentEnd
      }
    }
    pending = []
  }

  for (let index = 1; index < workingNodes.length; index += 1) {
    const node = workingNodes[index]
    if (node.kind === 'on') {
      flushSegment({ x: node.x, y: node.y })
    } else {
      pending.push(node)
    }
  }
  flushSegment({ x: workingNodes[0].x, y: workingNodes[0].y })
  return polygon
}

const getPolygonsBounds = (polygons) => {
  let bounds = null
  for (const polygon of polygons) {
    for (const point of polygon) {
      if (!bounds) {
        bounds = { xMin: point.x, xMax: point.x, yMin: point.y, yMax: point.y }
      } else {
        bounds.xMin = Math.min(bounds.xMin, point.x)
        bounds.xMax = Math.max(bounds.xMax, point.x)
        bounds.yMin = Math.min(bounds.yMin, point.y)
        bounds.yMax = Math.max(bounds.yMax, point.y)
      }
    }
  }
  return bounds
}

const getSignedArea = (polygon) => {
  let area = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

const isPointInPolygon = (point, polygon) => {
  let inside = false
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

const boundsContain = (outer, inner) =>
  outer.xMin <= inner.xMin &&
  outer.xMax >= inner.xMax &&
  outer.yMin <= inner.yMin &&
  outer.yMax >= inner.yMax

const containsContour = (outer, inner) => {
  const step = Math.max(1, Math.floor(inner.length / 8))
  let insideCount = 0
  let sampleCount = 0
  for (let index = 0; index < inner.length; index += step) {
    sampleCount += 1
    if (isPointInPolygon(inner[index], outer)) {
      insideCount += 1
    }
  }
  return insideCount * 2 > sampleCount
}

const classifyInkContours = (polygons) => {
  const contours = []
  for (const polygon of polygons) {
    const area = Math.abs(getSignedArea(polygon))
    const bounds = getPolygonsBounds([polygon])
    if (area > 0 && bounds) {
      contours.push({ polygon, area, bounds, sign: 1 })
    }
  }
  contours.sort((left, right) => right.area - left.area)

  for (let index = 0; index < contours.length; index += 1) {
    const contour = contours[index]
    const depth = contours
      .slice(0, index)
      .filter(
        (candidate) =>
          boundsContain(candidate.bounds, contour.bounds) &&
          containsContour(candidate.polygon, contour.polygon)
      ).length
    contour.sign = depth % 2 === 0 ? 1 : -1
  }
  return contours
}

const computeInkMoments = (polygons) => {
  let totalArea = 0
  let sumX = 0
  let sumY = 0

  for (const contour of classifyInkContours(polygons)) {
    const polygon = contour.polygon
    let signedArea = 0
    let momentX = 0
    let momentY = 0
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]
      const next = polygon[(index + 1) % polygon.length]
      const cross = current.x * next.y - next.x * current.y
      signedArea += cross
      momentX += (current.x + next.x) * cross
      momentY += (current.y + next.y) * cross
    }
    signedArea /= 2
    if (signedArea === 0) {
      continue
    }
    const weight = contour.sign * Math.abs(signedArea)
    sumX += weight * (momentX / (6 * signedArea))
    sumY += weight * (momentY / (6 * signedArea))
    totalArea += weight
  }

  return totalArea > 0
    ? {
        area: totalArea,
        centroidX: sumX / totalArea,
        centroidY: sumY / totalArea,
      }
    : null
}

const getSideCoverage = (polygons, bounds, side, bandWidth) => {
  const isHorizontalSide = side === 'top' || side === 'bottom'
  const edgeValue =
    side === 'left'
      ? bounds.xMin
      : side === 'right'
        ? bounds.xMax
        : side === 'top'
          ? bounds.yMax
          : bounds.yMin

  let spanMin = Number.POSITIVE_INFINITY
  let spanMax = Number.NEGATIVE_INFINITY
  for (const polygon of polygons) {
    for (const point of polygon) {
      const edgeAxisValue = isHorizontalSide ? point.y : point.x
      const inBand =
        side === 'left' || side === 'bottom'
          ? edgeAxisValue <= edgeValue + bandWidth
          : edgeAxisValue >= edgeValue - bandWidth
      if (!inBand) {
        continue
      }
      const spanValue = isHorizontalSide ? point.x : point.y
      spanMin = Math.min(spanMin, spanValue)
      spanMax = Math.max(spanMax, spanValue)
    }
  }
  if (!Number.isFinite(spanMin) || !Number.isFinite(spanMax)) {
    return 0
  }
  const sideLength =
    side === 'top' || side === 'bottom'
      ? bounds.xMax - bounds.xMin
      : bounds.yMax - bounds.yMin
  return sideLength > 0 ? (spanMax - spanMin) / sideLength : 0
}

const buildSidesFromPolygons = (polygons, bounds, advance, bodyBox) => {
  const bandWidth = bodyBox.unitsPerEm * EDGE_BAND_RATIO
  const buildSide = (side, bearing) => {
    const coverage = getSideCoverage(polygons, bounds, side, bandWidth)
    return {
      type: coverage >= FRAMING_COVERAGE_THRESHOLD ? 'framing' : 'branching',
      bearing: Math.round(bearing),
      coverage,
    }
  }
  return {
    left: buildSide('left', bounds.xMin),
    right: buildSide('right', advance - bounds.xMax),
    top: buildSide('top', bodyBox.top - bounds.yMax),
    bottom: buildSide('bottom', bounds.yMin - bodyBox.bottom),
  }
}

const PROJECTION_BINS = 128

// Widest ink-free band inside the face box, projected per axis.
const computeProjectionGaps = (polygons, bounds) => {
  const width = bounds.xMax - bounds.xMin
  const height = bounds.yMax - bounds.yMin
  const coveredX = new Array(PROJECTION_BINS).fill(false)
  const coveredY = new Array(PROJECTION_BINS).fill(false)
  const binOf = (value, min, size) =>
    Math.min(
      PROJECTION_BINS - 1,
      Math.max(0, Math.floor(((value - min) / size) * PROJECTION_BINS))
    )
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index]
      const next = polygon[(index + 1) % polygon.length]
      if (width > 0) {
        const from = binOf(Math.min(current.x, next.x), bounds.xMin, width)
        const to = binOf(Math.max(current.x, next.x), bounds.xMin, width)
        for (let bin = from; bin <= to; bin += 1) {
          coveredX[bin] = true
        }
      }
      if (height > 0) {
        const from = binOf(Math.min(current.y, next.y), bounds.yMin, height)
        const to = binOf(Math.max(current.y, next.y), bounds.yMin, height)
        for (let bin = from; bin <= to; bin += 1) {
          coveredY[bin] = true
        }
      }
    }
  }
  const longestGap = (covered, size) => {
    let longest = 0
    let run = 0
    for (const bin of covered) {
      if (bin) {
        longest = Math.max(longest, run)
        run = 0
      } else {
        run += 1
      }
    }
    return (longest / PROJECTION_BINS) * size
  }
  return {
    gapX: width > 0 ? longestGap(coveredX, width) : 0,
    gapY: height > 0 ? longestGap(coveredY, height) : 0,
  }
}

const featureStatKey = (feature) =>
  feature.cohort ? `${feature.key}@${feature.cohort}` : feature.key

const collectReferenceFeatures = (sample, bodyBox, semanticEnclosure) => {
  const sideType = (side) =>
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
  const faceCohort = `h${hFraming}v${vFraming}`
  const features = [
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
      value: (sample.moments.centroidX - sample.advance / 2) / sample.advance,
    },
    {
      key: 'balance:centroidY',
      value: (sample.moments.centroidY - bodyCenterY) / bodyBox.unitsPerEm,
    },
  ]
  if (faceHeight > 0) {
    features.push({
      key: 'face:aspect',
      value: faceWidth / faceHeight,
      cohort: faceCohort,
    })
  }
  const faceArea = faceWidth * faceHeight
  if (faceArea > 0) {
    features.push({
      key: 'ink:toFace',
      value: Math.min(1, sample.moments.area / faceArea),
      cohort: faceCohort,
    })
  }
  if (faceWidth > 0) {
    features.push({
      key: 'gap:x',
      value: sample.gaps.gapX / faceWidth,
      cohort: `h${hFraming}`,
    })
  }
  if (faceHeight > 0) {
    features.push({
      key: 'gap:y',
      value: sample.gaps.gapY / faceHeight,
      cohort: `v${vFraming}`,
    })
  }
  // Bearings are stored type-agnostic (per side) and normalized by UPM.
  const opposite = {
    left: 'right',
    right: 'left',
    top: 'bottom',
    bottom: 'top',
  }
  for (const side of ['left', 'right', 'top', 'bottom']) {
    features.push({
      key: `bearing:${side}`,
      value: sample.sides[side].bearing / bodyBox.unitsPerEm,
      cohort: `${sideType(side)}:${sideType(opposite[side])}`,
    })
  }
  return features
}

const buildSamples = (font, enclosureCharacters) => {
  const top =
    typeof font.ascender === 'number' && Number.isFinite(font.ascender)
      ? font.ascender
      : Math.round(font.unitsPerEm * DEFAULT_ASCENDER_RATIO)
  const bottom =
    typeof font.descender === 'number' && Number.isFinite(font.descender)
      ? font.descender
      : top - font.unitsPerEm
  const bodyBox = { top, bottom, unitsPerEm: font.unitsPerEm }
  const samples = []
  const seenCharacters = new Set()

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
      .map(contourToNodes)
      .filter(Boolean)
      .map(flattenContour)
      .filter((polygon) => polygon.length >= 3)
    const bounds = getPolygonsBounds(polygons)
    const moments = computeInkMoments(polygons)
    const advance = glyph.advanceWidth ?? font.unitsPerEm
    if (!bounds || !moments || advance <= 0) {
      continue
    }

    for (const character of characters) {
      seenCharacters.add(character)
    }
    const sides = buildSidesFromPolygons(polygons, bounds, advance, bodyBox)
    const sample = {
      characters,
      advance,
      bounds,
      sides,
      moments,
      gaps: computeProjectionGaps(polygons, bounds),
      complexity: Math.sqrt(Math.max(0, moments.area)) / bodyBox.unitsPerEm,
    }
    sample.features = collectReferenceFeatures(
      sample,
      bodyBox,
      characters.some((character) => enclosureCharacters.has(character))
    )
    samples.push(sample)
  }

  return { bodyBox, samples }
}

const buildWindows = (samples) => {
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
  const windows = []

  for (let start = 0; ; start += stride) {
    const windowStart = Math.min(start, lastStart)
    const slice = sorted.slice(windowStart, windowStart + windowSize)
    const statsByKey = new Map()
    const valuesByKey = new Map()
    const pushValue = (key, value) => {
      const values = valuesByKey.get(key) ?? []
      values.push(value)
      valuesByKey.set(key, values)
    }
    for (const sample of slice) {
      for (const feature of sample.features) {
        pushValue(featureStatKey(feature), feature.value)
        if (feature.cohort) {
          // Bare-key stats act as fallback for sparse cohorts.
          pushValue(feature.key, feature.value)
        }
      }
    }
    for (const [key, values] of valuesByKey) {
      if (values.length >= MIN_RADAR_SAMPLES) {
        statsByKey.set(key, { median: medianOf(values) })
      }
    }
    windows.push({
      centerComplexity: medianOf(slice.map((sample) => sample.complexity)),
      statsByKey,
    })
    if (windowStart >= lastStart) {
      break
    }
  }
  return windows
}

const nearestWindow = (windows, complexity) => {
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

const roundResidual = (value) => Number(value.toFixed(6))

const buildResidualData = (samples) => {
  const windows = buildWindows(samples)
  const residualsByCharacter = new Map()
  for (const sample of samples) {
    const window = nearestWindow(windows, sample.complexity)
    const residuals = {}
    for (const feature of sample.features) {
      const stat =
        window.statsByKey.get(featureStatKey(feature)) ??
        window.statsByKey.get(feature.key)
      if (stat) {
        residuals[feature.key] = roundResidual(feature.value - stat.median)
      }
    }
    if (Object.keys(residuals).length > 0) {
      for (const character of sample.characters) {
        residualsByCharacter.set(character, residuals)
      }
    }
  }
  return Object.fromEntries(
    [...residualsByCharacter].sort(
      ([left], [right]) => left.codePointAt(0) - right.codePointAt(0)
    )
  )
}

const main = async () => {
  console.log(`Loading reference font from ${source}`)
  const font = opentype.parse(await loadFontBuffer(source))
  console.log(
    `Parsed font with ${font.glyphs.length.toLocaleString()} glyphs, UPM ${font.unitsPerEm}`
  )

  const enclosureCharacters = buildEnclosureCharacterSet()
  const { bodyBox, samples } = buildSamples(font, enclosureCharacters)
  if (samples.length < MIN_RADAR_SAMPLES) {
    throw new Error(
      `Only ${samples.length} Han samples; need at least ${MIN_RADAR_SAMPLES}`
    )
  }

  const residualsByCharacter = buildResidualData(samples)
  const payload = {
    schemaVersion: 1,
    source: 'Noto Sans CJK TC Regular',
    sourceUrl: NOTO_SOURCE_URL,
    defaultConfidence: DEFAULT_CONFIDENCE,
    sampleCount: samples.length,
    bodyBox,
    features: SUPPORTED_FEATURE_KEYS,
    residualsByCharacter,
  }

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  console.log(
    `Wrote ${Object.keys(residualsByCharacter).length.toLocaleString()} residual entries to ${outputPath}`
  )
}

await main()
