import type { GlyphData } from 'src/store'

const IDS_OPERATOR_MIN = 0x2ff0
const IDS_OPERATOR_MAX = 0x2ffb

const CJK_RANGES: Array<[number, number]> = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x2ebef],
  [0x30000, 0x3134f],
]

export const getGlyphCharacter = (glyph: GlyphData | null | undefined) => {
  if (!glyph) {
    return null
  }

  if (glyph.unicode) {
    const codePoint = Number.parseInt(glyph.unicode, 16)
    if (Number.isFinite(codePoint)) {
      return String.fromCodePoint(codePoint)
    }
  }

  return Array.from(glyph.name ?? '').length === 1 ? glyph.name : null
}

export const isCjkCharacter = (character: string | null | undefined) => {
  if (!character) {
    return false
  }

  const codePoint = character.codePointAt(0)
  if (
    !codePoint ||
    (codePoint >= IDS_OPERATOR_MIN && codePoint <= IDS_OPERATOR_MAX)
  ) {
    return false
  }

  return CJK_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to)
}

const normalizeGlyphRelationBase = (glyphId: string) =>
  glyphId.split(/[._-]/, 1)[0]?.toLowerCase() ?? glyphId.toLowerCase()

export const getRelatedGlyphs = (
  glyph: GlyphData | null | undefined,
  glyphs: GlyphData[]
) => {
  if (!glyph) {
    return []
  }

  const base = normalizeGlyphRelationBase(glyph.id)
  return glyphs
    .filter((candidate) => candidate.id !== glyph.id)
    .filter((candidate) => normalizeGlyphRelationBase(candidate.id) === base)
    .sort((left, right) => left.id.localeCompare(right.id))
}
