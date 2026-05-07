import type { FontData } from 'src/store'

export const charIndexToCodeUnitIndex = (text: string, charIndex: number) =>
  Array.from(text).slice(0, charIndex).join('').length

export const codeUnitIndexToCharIndex = (
  text: string,
  codeUnitIndex: number
) => {
  let consumedUnits = 0
  let charIndex = 0
  for (const character of Array.from(text)) {
    if (consumedUnits >= codeUnitIndex) {
      break
    }
    consumedUnits += character.length
    charIndex += 1
  }
  return charIndex
}

export const buildGlyphIdByCharacter = (fontData: FontData | null) => {
  const entries = new Map<string, string>()
  if (!fontData) {
    return entries
  }

  for (const glyph of Object.values(fontData.glyphs)) {
    if (!glyph.unicode) {
      continue
    }
    const codePoint = Number.parseInt(glyph.unicode, 16)
    if (!Number.isFinite(codePoint)) {
      continue
    }
    const character = String.fromCodePoint(codePoint)
    if (!entries.has(character)) {
      entries.set(character, glyph.id)
    }
  }

  return entries
}
