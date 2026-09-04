import { getPrimaryGlyphUnicode } from '@/lib/glyph/glyphUnicode'
import {
  unicodeHexToCharacter,
  unicodeHexToCodePoint,
} from '@/lib/project/unicode'
import type { GlyphData } from '@/domain'

export const SCRIPT_RANGES: Array<{ from: number; to: number; label: string }> =
  [
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

interface GlyphCategoryDefinition {
  id: string
  label: string
  matches: (character: string | null) => boolean
}

export const matchesUnicodeProperty = (
  character: string | null,
  pattern: RegExp
) => Boolean(character && pattern.test(character))

export const GLYPH_CATEGORY_DEFINITIONS: GlyphCategoryDefinition[] = [
  {
    id: 'letter',
    label: 'Letter',
    matches: (character) => matchesUnicodeProperty(character, /\p{Letter}/u),
  },
  {
    id: 'number',
    label: 'Number',
    matches: (character) => matchesUnicodeProperty(character, /\p{Number}/u),
  },
  {
    id: 'separator',
    label: 'Separator',
    matches: (character) => matchesUnicodeProperty(character, /\p{Separator}/u),
  },
  {
    id: 'punctuation',
    label: 'Punctuation',
    matches: (character) =>
      matchesUnicodeProperty(character, /\p{Punctuation}/u),
  },
  {
    id: 'symbol',
    label: 'Symbol',
    matches: (character) => matchesUnicodeProperty(character, /\p{Symbol}/u),
  },
  {
    id: 'mark',
    label: 'Mark',
    matches: (character) => matchesUnicodeProperty(character, /\p{Mark}/u),
  },
]

export const OTHER_CATEGORY = {
  id: 'other',
  label: 'Other',
}

export const UNENCODED_CATEGORY = {
  id: 'unencoded',
  label: 'Unencoded',
}

export const getCodePoint = (glyph: GlyphData) => {
  const primaryUnicode = getPrimaryGlyphUnicode(glyph)
  if (!primaryUnicode) {
    return null
  }

  return unicodeHexToCodePoint(primaryUnicode)
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
  return unicodeHexToCharacter(getPrimaryGlyphUnicode(glyph))
}

const getInferredGlyphCategory = (glyph: GlyphData) => {
  const character = getGlyphDisplayCharacter(glyph)
  if (!character) {
    return getPrimaryGlyphUnicode(glyph) ? OTHER_CATEGORY : UNENCODED_CATEGORY
  }

  return (
    GLYPH_CATEGORY_DEFINITIONS.find((definition) =>
      definition.matches(character)
    ) ?? OTHER_CATEGORY
  )
}

export const getGlyphCategoryPath = (glyph: GlyphData) => {
  const explicitCategory = glyph.category?.trim()
  const explicitSubCategory = glyph.subCategory?.trim()
  const fallbackCategory = getInferredGlyphCategory(glyph)

  return {
    category: explicitCategory || fallbackCategory.label,
    subCategory: explicitSubCategory || null,
  }
}
