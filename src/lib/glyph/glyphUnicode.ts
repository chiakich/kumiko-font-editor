import type { GlyphData } from '@/domain'
import {
  normalizeUnicodeHex,
  unicodeHexToCharacter,
} from '@/lib/project/unicode'

export const getGlyphUnicodes = (glyph: Pick<GlyphData, 'unicodes'>) =>
  (glyph.unicodes ?? [])
    .map((unicode) => normalizeUnicodeHex(unicode))
    .filter((unicode): unicode is string => Boolean(unicode))

export const getPrimaryGlyphUnicode = (
  glyph: Pick<GlyphData, 'unicodes'> | undefined
) => getGlyphUnicodes(glyph ?? {}).at(0) ?? null

export const getGlyphUnicodeChar = (
  glyph: Pick<GlyphData, 'unicodes'> | undefined
) => unicodeHexToCharacter(getPrimaryGlyphUnicode(glyph))
