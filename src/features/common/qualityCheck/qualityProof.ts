import { buildGlyphPreviewData } from 'src/lib/glyphOverview'
import { getGlyphLayer, type FontData, type GlyphData } from 'src/store'
import { getGlyphBounds } from 'src/features/common/qualityCheck/qualityLint'

export interface ProofShape {
  d: string
  transform?: string
}

export interface ProofGlyph {
  key: string
  character: string
  advance: number
  glyphId?: string
  glyphName?: string
  shapes: ProofShape[]
  inkRatio: number | null
  isSpace: boolean
  isMissing: boolean
}

export interface ProofRun {
  glyphs: ProofGlyph[]
  totalAdvance: number
  matchedCount: number
  missingCount: number
  averageInkRatio: number | null
}

export interface GrayProofRow {
  fontSize: number
  proofRun: ProofRun
  densityPercent: number | null
}

export interface GlyphInkSample {
  glyphId: string
  glyphName: string
  character: string
  inkRatio: number | null
}

export const mixedProofPresets = [
  '永Typography 123，Hello 字体。',
  '中文字體設計 ABC abc 0123456789，標點：、。「」',
  '醒目的混排測試：Kumiko Font Editor / PR #128',
]

const DEFAULT_UNITS_PER_EM = 1000
const MAX_PROOF_CHARACTERS = 140
const SPACE_ADVANCE_RATIO = 0.5
const MISSING_ADVANCE_RATIO = 0.6

const getGlyphCodePoint = (glyph: GlyphData) => {
  if (!glyph.unicode) {
    return null
  }

  const parsed = Number.parseInt(glyph.unicode, 16)
  return Number.isFinite(parsed) ? parsed : null
}

export const getGlyphCharacter = (glyph: GlyphData) => {
  const codePoint = getGlyphCodePoint(glyph)
  return codePoint === null
    ? glyph.name.slice(0, 2)
    : String.fromCodePoint(codePoint)
}

const buildUnicodeGlyphMap = (fontData: FontData) => {
  const glyphByCharacter = new Map<string, GlyphData>()
  for (const glyph of Object.values(fontData.glyphs)) {
    const codePoint = getGlyphCodePoint(glyph)
    if (codePoint !== null) {
      glyphByCharacter.set(String.fromCodePoint(codePoint), glyph)
    }
  }
  return glyphByCharacter
}

const getAverage = (values: number[]) =>
  values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null

const transformPoint = (
  point: { x: number; y: number },
  transform: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
  }
) => {
  const scaledX = point.x * transform.scaleX
  const scaledY = point.y * transform.scaleY
  const radians = (transform.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: scaledX * cos - scaledY * sin + transform.x,
    y: scaledX * sin + scaledY * cos + transform.y,
  }
}

const mergeBounds = (
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number } | null,
  next: { xMin: number; xMax: number; yMin: number; yMax: number } | null
) => {
  if (!next) {
    return bounds
  }
  if (!bounds) {
    return next
  }
  return {
    xMin: Math.min(bounds.xMin, next.xMin),
    xMax: Math.max(bounds.xMax, next.xMax),
    yMin: Math.min(bounds.yMin, next.yMin),
    yMax: Math.max(bounds.yMax, next.yMax),
  }
}

const getTransformedBounds = (
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  transform: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
  }
) => {
  const points = [
    transformPoint({ x: bounds.xMin, y: bounds.yMin }, transform),
    transformPoint({ x: bounds.xMin, y: bounds.yMax }, transform),
    transformPoint({ x: bounds.xMax, y: bounds.yMin }, transform),
    transformPoint({ x: bounds.xMax, y: bounds.yMax }, transform),
  ]
  return {
    xMin: Math.min(...points.map((point) => point.x)),
    xMax: Math.max(...points.map((point) => point.x)),
    yMin: Math.min(...points.map((point) => point.y)),
    yMax: Math.max(...points.map((point) => point.y)),
  }
}

const getGlyphCompositeBounds = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  visited = new Set<string>()
) => {
  if (visited.has(glyph.id)) {
    return null
  }

  const activeLayer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph
  let bounds = getGlyphBounds({ paths: activeLayer.paths })
  const nextVisited = new Set(visited)
  nextVisited.add(glyph.id)

  for (const componentRef of activeLayer.componentRefs) {
    const componentGlyph = glyphMap[componentRef.glyphId]
    if (!componentGlyph) {
      continue
    }
    const componentBounds = getGlyphCompositeBounds(
      componentGlyph,
      glyphMap,
      nextVisited
    )
    bounds = mergeBounds(
      bounds,
      componentBounds
        ? getTransformedBounds(componentBounds, componentRef)
        : null
    )
  }

  return bounds
}

export const estimateGlyphInkRatio = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  unitsPerEm: number
) => {
  const activeLayer = getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph
  const bounds = getGlyphCompositeBounds(glyph, glyphMap)
  if (!bounds || activeLayer.metrics.width <= 0 || unitsPerEm <= 0) {
    return null
  }

  const inkBoxArea =
    Math.max(0, bounds.xMax - bounds.xMin) *
    Math.max(0, bounds.yMax - bounds.yMin)
  const emArea = activeLayer.metrics.width * unitsPerEm
  return Math.min(1, inkBoxArea / emArea)
}

export const buildProofText = (glyphs: GlyphData[], proofText: string) => {
  const scopedCharacters = glyphs.map(getGlyphCharacter).join('')
  return scopedCharacters ? `${scopedCharacters} ${proofText}` : proofText
}

export const buildProofRun = (
  fontData: FontData | null | undefined,
  text: string
): ProofRun => {
  const unitsPerEm = fontData?.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const glyphByCharacter = fontData ? buildUnicodeGlyphMap(fontData) : new Map()
  const glyphs: ProofGlyph[] = []
  let cursor = 0
  let matchedCount = 0
  let missingCount = 0
  const inkRatios: number[] = []

  for (const [index, character] of Array.from(text)
    .slice(0, MAX_PROOF_CHARACTERS)
    .entries()) {
    const isSpace = /\s/u.test(character)
    const glyph = glyphByCharacter.get(character)
    const activeLayer = glyph
      ? (getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph)
      : null
    const advance = glyph
      ? Math.max(
          activeLayer?.metrics.width ?? glyph.metrics.width,
          unitsPerEm * 0.2
        )
      : unitsPerEm * (isSpace ? SPACE_ADVANCE_RATIO : MISSING_ADVANCE_RATIO)
    const inkRatio =
      glyph && fontData
        ? estimateGlyphInkRatio(glyph, fontData.glyphs, unitsPerEm)
        : null
    if (inkRatio !== null) {
      inkRatios.push(inkRatio)
    }
    if (glyph) {
      matchedCount += 1
    } else if (!isSpace) {
      missingCount += 1
    }

    glyphs.push({
      key: `${index}-${character}-${cursor}`,
      character,
      advance,
      glyphId: glyph?.id,
      glyphName: glyph?.name,
      shapes:
        glyph && fontData
          ? buildGlyphPreviewData(glyph, fontData.glyphs).shapes
          : [],
      inkRatio,
      isSpace,
      isMissing: !glyph && !isSpace,
    })
    cursor += advance
  }

  return {
    glyphs,
    totalAdvance: Math.max(cursor, unitsPerEm),
    matchedCount,
    missingCount,
    averageInkRatio: getAverage(inkRatios),
  }
}

export const buildGrayProofRows = (
  fontData: FontData | null | undefined,
  text: string,
  fontSizes = [9, 12, 16, 24]
): GrayProofRow[] =>
  fontSizes.map((fontSize) => {
    const proofRun = buildProofRun(fontData, text)
    return {
      fontSize,
      proofRun,
      densityPercent:
        proofRun.averageInkRatio === null
          ? null
          : Math.round(proofRun.averageInkRatio * 100),
    }
  })

export const buildGlyphInkSamples = (
  glyphs: GlyphData[],
  fontData: FontData | null | undefined
): GlyphInkSample[] => {
  if (!fontData) {
    return []
  }

  const unitsPerEm = fontData.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  return glyphs
    .map((glyph) => ({
      glyphId: glyph.id,
      glyphName: glyph.name,
      character: getGlyphCharacter(glyph),
      inkRatio: estimateGlyphInkRatio(glyph, fontData.glyphs, unitsPerEm),
    }))
    .sort(
      (left, right) =>
        (right.inkRatio ?? -1) - (left.inkRatio ?? -1) ||
        left.glyphName.localeCompare(right.glyphName)
    )
    .slice(0, 24)
}
