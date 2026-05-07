import { VarPackedPath } from 'src/font/VarPackedPath'
import type { GlyphData } from 'src/store'

export type OverviewGroupBy = 'none' | 'script' | 'block'

export interface GlyphOverviewSection {
  id: string
  label: string
  glyphs: GlyphData[]
}

const SCRIPT_RANGES: Array<{ from: number; to: number; label: string }> = [
  { from: 0x0000, to: 0x024f, label: 'Latin' },
  { from: 0x0370, to: 0x03ff, label: 'Greek' },
  { from: 0x0400, to: 0x052f, label: 'Cyrillic' },
  { from: 0x0590, to: 0x05ff, label: 'Hebrew' },
  { from: 0x0600, to: 0x06ff, label: 'Arabic' },
  { from: 0x3040, to: 0x309f, label: 'Hiragana' },
  { from: 0x30a0, to: 0x30ff, label: 'Katakana' },
  { from: 0x3100, to: 0x312f, label: 'Bopomofo' },
  { from: 0x3130, to: 0x318f, label: 'Hangul Jamo' },
  { from: 0x31a0, to: 0x31bf, label: 'Bopomofo Extended' },
  { from: 0x3400, to: 0x4dbf, label: 'CJK Extension A' },
  { from: 0x4e00, to: 0x9fff, label: 'CJK Unified Ideographs' },
  { from: 0xac00, to: 0xd7af, label: 'Hangul Syllables' },
  { from: 0xf900, to: 0xfaff, label: 'CJK Compatibility Ideographs' },
  { from: 0xff00, to: 0xffef, label: 'Halfwidth and Fullwidth Forms' },
]

const BLOCK_RANGES: Array<{ from: number; to: number; label: string }> = [
  { from: 0x0000, to: 0x007f, label: 'Basic Latin' },
  { from: 0x0080, to: 0x00ff, label: 'Latin-1 Supplement' },
  { from: 0x0100, to: 0x017f, label: 'Latin Extended-A' },
  { from: 0x0180, to: 0x024f, label: 'Latin Extended-B' },
  { from: 0x0370, to: 0x03ff, label: 'Greek and Coptic' },
  { from: 0x0400, to: 0x04ff, label: 'Cyrillic' },
  { from: 0x2000, to: 0x206f, label: 'General Punctuation' },
  { from: 0x20a0, to: 0x20cf, label: 'Currency Symbols' },
  { from: 0x2100, to: 0x214f, label: 'Letterlike Symbols' },
  { from: 0x2190, to: 0x21ff, label: 'Arrows' },
  { from: 0x2200, to: 0x22ff, label: 'Mathematical Operators' },
  { from: 0x2460, to: 0x24ff, label: 'Enclosed Alphanumerics' },
  { from: 0x2500, to: 0x257f, label: 'Box Drawing' },
  { from: 0x2580, to: 0x259f, label: 'Block Elements' },
  { from: 0x25a0, to: 0x25ff, label: 'Geometric Shapes' },
  { from: 0x2600, to: 0x26ff, label: 'Miscellaneous Symbols' },
  { from: 0x27c0, to: 0x27ef, label: 'Miscellaneous Mathematical Symbols-A' },
  { from: 0x27f0, to: 0x27ff, label: 'Supplemental Arrows-A' },
  { from: 0x3000, to: 0x303f, label: 'CJK Symbols and Punctuation' },
  { from: 0x3040, to: 0x309f, label: 'Hiragana' },
  { from: 0x30a0, to: 0x30ff, label: 'Katakana' },
  { from: 0x3100, to: 0x312f, label: 'Bopomofo' },
  { from: 0x3130, to: 0x318f, label: 'Hangul Compatibility Jamo' },
  { from: 0x31a0, to: 0x31bf, label: 'Bopomofo Extended' },
  { from: 0x3400, to: 0x4dbf, label: 'CJK Unified Ideographs Extension A' },
  { from: 0x4e00, to: 0x9fff, label: 'CJK Unified Ideographs' },
  { from: 0xac00, to: 0xd7af, label: 'Hangul Syllables' },
  { from: 0xf900, to: 0xfaff, label: 'CJK Compatibility Ideographs' },
  { from: 0xff00, to: 0xffef, label: 'Halfwidth and Fullwidth Forms' },
]

const getCodePoint = (glyph: GlyphData) => {
  if (!glyph.unicode) {
    return null
  }

  const parsed = Number.parseInt(glyph.unicode, 16)
  return Number.isFinite(parsed) ? parsed : null
}

const findRangeLabel = (
  codePoint: number | null,
  ranges: Array<{ from: number; to: number; label: string }>
) => {
  if (codePoint === null) {
    return 'Unencoded'
  }

  return (
    ranges.find((range) => codePoint >= range.from && codePoint <= range.to)
      ?.label ?? 'Other'
  )
}

export const getGlyphScriptLabel = (glyph: GlyphData) =>
  findRangeLabel(getCodePoint(glyph), SCRIPT_RANGES)

export const getGlyphBlockLabel = (glyph: GlyphData) =>
  findRangeLabel(getCodePoint(glyph), BLOCK_RANGES)

export const getGlyphDisplayCharacter = (glyph: GlyphData) => {
  const codePoint = getCodePoint(glyph)
  return codePoint === null ? null : String.fromCodePoint(codePoint)
}

export const getGlyphOverviewSections = (
  glyphs: GlyphData[],
  groupBy: OverviewGroupBy
): GlyphOverviewSection[] => {
  if (groupBy === 'none') {
    return [
      {
        id: 'all',
        label: '全部',
        glyphs: [...glyphs].sort((left, right) =>
          left.id.localeCompare(right.id)
        ),
      },
    ]
  }

  const sectionMap = new Map<string, GlyphData[]>()

  for (const glyph of glyphs) {
    const key =
      groupBy === 'script'
        ? getGlyphScriptLabel(glyph)
        : getGlyphBlockLabel(glyph)
    const items = sectionMap.get(key) ?? []
    items.push(glyph)
    sectionMap.set(key, items)
  }

  return [...sectionMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, sectionGlyphs]) => ({
      id: label,
      label,
      glyphs: [...sectionGlyphs].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
    }))
}

export const getGlyphOverviewStats = (glyph: GlyphData) => ({
  contourCount: glyph.paths.length,
  componentCount: glyph.componentRefs.length,
  anchorCount: glyph.anchors?.length ?? 0,
  guidelineCount: glyph.guidelines?.length ?? 0,
})

export interface GlyphPreviewShape {
  d: string
  transform?: string
}

export interface GlyphPreviewData {
  width: number
  viewBox: string
  shapes: GlyphPreviewShape[]
}

const glyphPreviewCache = new WeakMap<
  Record<string, GlyphData>,
  WeakMap<GlyphData, GlyphPreviewData>
>()

const PREVIEW_PADDING_X = 80
const PREVIEW_ASCENDER = 900
const PREVIEW_DESCENDER = -220

const buildPathSvg = (glyph: GlyphData) => {
  const contours = glyph.paths.map((path) => ({
    isClosed: path.closed,
    points: path.nodes.map((node) => ({
      x: node.x,
      y: node.y,
      type: (node.type === 'offcurve'
        ? 'offCurveCubic'
        : node.type === 'qcurve'
          ? 'offCurveQuad'
          : 'onCurve') as 'onCurve' | 'offCurveQuad' | 'offCurveCubic',
      smooth: node.type === 'smooth',
    })),
  }))

  return VarPackedPath.fromUnpackedContours(contours).toSVGPath()
}

const buildGlyphPreviewShapes = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>,
  visited = new Set<string>(),
  depth = 0
): GlyphPreviewShape[] => {
  if (visited.has(glyph.id) || depth > 8) {
    return []
  }

  const nextVisited = new Set(visited)
  nextVisited.add(glyph.id)

  const shapes: GlyphPreviewShape[] = []
  if (glyph.paths.length > 0) {
    shapes.push({ d: buildPathSvg(glyph) })
  }

  for (const component of glyph.componentRefs) {
    const baseGlyph = glyphMap[component.glyphId]
    if (!baseGlyph) {
      continue
    }

    const transform = [
      `translate(${component.x} ${component.y})`,
      component.rotation ? `rotate(${component.rotation})` : '',
      component.scaleX !== 1 || component.scaleY !== 1
        ? `scale(${component.scaleX} ${component.scaleY})`
        : '',
    ]
      .filter(Boolean)
      .join(' ')

    const nestedShapes = buildGlyphPreviewShapes(
      baseGlyph,
      glyphMap,
      nextVisited,
      depth + 1
    )
    for (const nestedShape of nestedShapes) {
      shapes.push({
        d: nestedShape.d,
        transform: [transform, nestedShape.transform].filter(Boolean).join(' '),
      })
    }
  }

  return shapes
}

export const buildGlyphPreviewData = (
  glyph: GlyphData,
  glyphMap: Record<string, GlyphData>
): GlyphPreviewData => {
  let glyphMapCache = glyphPreviewCache.get(glyphMap)
  if (!glyphMapCache) {
    glyphMapCache = new WeakMap()
    glyphPreviewCache.set(glyphMap, glyphMapCache)
  }

  const cachedPreview = glyphMapCache.get(glyph)
  if (cachedPreview) {
    return cachedPreview
  }

  const width = Math.max(glyph.metrics.width || 0, 240)
  const shapes = buildGlyphPreviewShapes(glyph, glyphMap)
  const viewBox = `${-PREVIEW_PADDING_X} ${PREVIEW_DESCENDER} ${width + PREVIEW_PADDING_X * 2} ${PREVIEW_ASCENDER - PREVIEW_DESCENDER + 100}`

  const preview = {
    width,
    viewBox,
    shapes,
  }
  glyphMapCache.set(glyph, preview)
  return preview
}
