import type { GlyphData } from 'src/store'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'

export const getGlyphUnicodes = (glyph: Pick<GlyphData, 'unicodes'>) =>
  (glyph.unicodes ?? [])
    .map((unicode) => normalizeUnicodeHex(unicode))
    .filter((unicode): unicode is string => Boolean(unicode))

export const getPrimaryGlyphUnicode = (
  glyph: Pick<GlyphData, 'unicodes'> | undefined
) => getGlyphUnicodes(glyph ?? {}).at(0) ?? null

export const getGlyphUnicodeChar = (
  glyph: Pick<GlyphData, 'unicodes'> | undefined
) => {
  const unicode = getPrimaryGlyphUnicode(glyph)
  if (!unicode) {
    return null
  }
  const codePoint = Number.parseInt(unicode, 16)
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : null
}
