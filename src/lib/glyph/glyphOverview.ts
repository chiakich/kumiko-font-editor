import { type GlyphData } from 'src/store'
import { activeLayer } from 'src/store/glyphLayer'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { getPrimaryGlyphUnicode } from 'src/lib/glyph/glyphUnicode'
import {
  unicodeHexToCharacter,
  unicodeHexToCodePoint,
} from 'src/lib/project/unicode'
export {
  buildGlyphPreviewData,
  buildGlyphPreviewFontRect,
  type GlyphPreviewData,
  type GlyphPreviewShape,
} from 'src/lib/glyph/glyphPreviewData'

export type OverviewGroupBy = 'none' | 'script' | 'block'

export interface GlyphOverviewSection {
  id: string
  label: string
  glyphs: GlyphData[]
}

export interface GlyphOverviewTreeNode extends GlyphOverviewSection {
  children?: GlyphOverviewTreeNode[]
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
  const primaryUnicode = getPrimaryGlyphUnicode(glyph)
  if (!primaryUnicode) {
    return null
  }

  return unicodeHexToCodePoint(primaryUnicode)
}

const getGlyphSortKey = (glyph: GlyphData) => {
  const codePoint = getCodePoint(glyph)
  return codePoint === null ? glyph.id : codePoint.toString().padStart(8, '0')
}

const sortGlyphsByCodePoint = (glyphs: GlyphData[]) =>
  [...glyphs].sort((left, right) => {
    const leftCodePoint = getCodePoint(left)
    const rightCodePoint = getCodePoint(right)
    if (leftCodePoint !== null && rightCodePoint !== null) {
      return leftCodePoint - rightCodePoint
    }
    return getGlyphSortKey(left).localeCompare(getGlyphSortKey(right))
  })

const sortGlyphsByRecentEdit = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes
) =>
  [...glyphs]
    .filter((glyph) => Number.isFinite(glyphEditTimes[glyph.id]))
    .sort(
      (left, right) =>
        (glyphEditTimes[right.id] ?? 0) - (glyphEditTimes[left.id] ?? 0) ||
        left.id.localeCompare(right.id)
    )

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
  return unicodeHexToCharacter(getPrimaryGlyphUnicode(glyph))
}

interface GlyphTypeDefinition {
  id: string
  label: string
  matches: (character: string | null) => boolean
}

const matchesUnicodeProperty = (character: string | null, pattern: RegExp) =>
  Boolean(character && pattern.test(character))

const GLYPH_TYPE_DEFINITIONS: GlyphTypeDefinition[] = [
  {
    id: 'letter',
    label: '字母',
    matches: (character) => matchesUnicodeProperty(character, /\p{Letter}/u),
  },
  {
    id: 'number',
    label: '數字',
    matches: (character) => matchesUnicodeProperty(character, /\p{Number}/u),
  },
  {
    id: 'separator',
    label: '分隔符號',
    matches: (character) => matchesUnicodeProperty(character, /\p{Separator}/u),
  },
  {
    id: 'punctuation',
    label: '標點',
    matches: (character) =>
      matchesUnicodeProperty(character, /\p{Punctuation}/u),
  },
  {
    id: 'symbol',
    label: '符號',
    matches: (character) => matchesUnicodeProperty(character, /\p{Symbol}/u),
  },
  {
    id: 'mark',
    label: '標號',
    matches: (character) => matchesUnicodeProperty(character, /\p{Mark}/u),
  },
]

const OTHER_GLYPH_TYPE = {
  id: 'other',
  label: '其他',
}

const UNENCODED_GLYPH_TYPE = {
  id: 'unencoded',
  label: '未編碼',
}

const getGlyphTypeDefinition = (glyph: GlyphData) => {
  const character = getGlyphDisplayCharacter(glyph)
  if (!character) {
    return getPrimaryGlyphUnicode(glyph)
      ? OTHER_GLYPH_TYPE
      : UNENCODED_GLYPH_TYPE
  }

  return (
    GLYPH_TYPE_DEFINITIONS.find((definition) =>
      definition.matches(character)
    ) ?? OTHER_GLYPH_TYPE
  )
}

const createSectionNode = (
  id: string,
  label: string,
  glyphs: GlyphData[],
  children?: GlyphOverviewTreeNode[]
): GlyphOverviewTreeNode => ({
  id,
  label,
  glyphs,
  ...(children ? { children } : {}),
})

const buildTypeNodes = (glyphs: GlyphData[]) => {
  const typeMap = new Map<string, GlyphData[]>()
  for (const glyph of glyphs) {
    const type = getGlyphTypeDefinition(glyph)
    const typeGlyphs = typeMap.get(type.id)
    if (typeGlyphs) {
      typeGlyphs.push(glyph)
    } else {
      typeMap.set(type.id, [glyph])
    }
  }

  const orderedTypes = [
    ...GLYPH_TYPE_DEFINITIONS.map(({ id, label }) => ({ id, label })),
    OTHER_GLYPH_TYPE,
    UNENCODED_GLYPH_TYPE,
  ]

  return orderedTypes
    .map(({ id, label }) => {
      const typeGlyphs = sortGlyphsByCodePoint(typeMap.get(id) ?? [])
      return createSectionNode(`type:${id}`, label, typeGlyphs)
    })
    .filter((node) => node.glyphs.length > 0)
}

const buildScriptNodes = (glyphs: GlyphData[]) => {
  const scriptMap = new Map<string, GlyphData[]>()
  for (const glyph of glyphs) {
    const label = getGlyphScriptLabel(glyph)
    const scriptGlyphs = scriptMap.get(label)
    if (scriptGlyphs) {
      scriptGlyphs.push(glyph)
    } else {
      scriptMap.set(label, [glyph])
    }
  }

  const labelsByOrder = [
    ...SCRIPT_RANGES.map((range) => range.label),
    'Other',
    'Unencoded',
  ]
  return labelsByOrder
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .map((label) => {
      const scriptGlyphs = sortGlyphsByCodePoint(scriptMap.get(label) ?? [])
      return createSectionNode(`script:${label}`, label, scriptGlyphs)
    })
    .filter((node) => node.glyphs.length > 0)
}

const buildCustomNodes = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes
) => [
  createSectionNode(
    'custom:recent-edits',
    '最近編輯',
    sortGlyphsByRecentEdit(glyphs, glyphEditTimes)
  ),
]

export const getGlyphOverviewTree = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes
): GlyphOverviewTreeNode[] => {
  const sortedGlyphs = sortGlyphsByCodePoint(glyphs)
  const typeNodes = buildTypeNodes(glyphs)
  const scriptNodes = buildScriptNodes(glyphs)
  const customNodes = buildCustomNodes(glyphs, glyphEditTimes)

  return [
    createSectionNode('all', '全部', sortedGlyphs),
    createSectionNode('type', '類型', sortedGlyphs, typeNodes),
    createSectionNode('script', '語系', sortedGlyphs, scriptNodes),
    createSectionNode(
      'custom',
      '自定篩選',
      customNodes.flatMap((node) => node.glyphs),
      customNodes
    ),
  ]
}

export const flattenGlyphOverviewTree = (
  nodes: GlyphOverviewTreeNode[]
): GlyphOverviewSection[] =>
  nodes.flatMap((node) => [
    {
      id: node.id,
      label: node.label,
      glyphs: node.glyphs,
    },
    ...flattenGlyphOverviewTree(node.children ?? []),
  ])

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

export const getGlyphOverviewStats = (glyph: GlyphData) => {
  const layer = activeLayer(glyph)
  return {
    contourCount: layer.paths.length,
    componentCount: layer.componentRefs.length,
    anchorCount: layer.anchors?.length ?? 0,
    guidelineCount: layer.guidelines?.length ?? 0,
  }
}
