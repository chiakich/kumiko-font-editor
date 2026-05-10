import type { GlyphData } from 'src/store/types'

const COMMON_LIGATURES = new Set([
  'f_i',
  'f_l',
  'f_f',
  'f_f_i',
  'f_f_l',
  'fi',
  'fl',
])

export const getGlyphBaseName = (glyphName: string) =>
  glyphName.replace(/\.[^.]+$/, '')

export const getGlyphSuffix = (glyphName: string) => {
  const match = glyphName.match(/(\.[^.]+)$/)
  return match?.[1] ?? null
}

export const isCommonLigatureName = (glyphName: string) =>
  COMMON_LIGATURES.has(glyphName)

export const splitLigatureName = (glyphName: string) => {
  const baseName = getGlyphBaseName(glyphName)
  if (baseName.includes('_')) {
    return baseName.split('_').filter(Boolean)
  }
  if (baseName === 'fi') return ['f', 'i']
  if (baseName === 'fl') return ['f', 'l']
  return null
}

export const getLocalizedLanguage = (glyphName: string) => {
  const match = glyphName.match(/\.locl([A-Za-z0-9 ]{3,4})$/)
  if (!match) return null
  return match[1].padEnd(4, ' ')
}

export const isLowercaseGlyph = (glyph: GlyphData) => {
  if (!glyph.unicode) return false
  const char = String.fromCodePoint(Number.parseInt(glyph.unicode, 16))
  return char.toLocaleLowerCase() === char && char.toLocaleUpperCase() !== char
}

export const isUppercaseGlyph = (glyph: GlyphData) => {
  if (!glyph.unicode) return false
  const char = String.fromCodePoint(Number.parseInt(glyph.unicode, 16))
  return char.toLocaleUpperCase() === char && char.toLocaleLowerCase() !== char
}
