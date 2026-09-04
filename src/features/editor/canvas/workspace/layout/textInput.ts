import type { FontData } from '@/store'
import { getGlyphUnicodeChar } from '@/lib/glyph/glyphUnicode'

interface GlyphAdditionCandidate {
  id: string
  name: string
  unicode: string | null
  production?: string | null
  width?: number
}

interface TextInputCommitOptions {
  fontData: FontData | null
  glyphIdByCharacter: Map<string, string>
  selectionStart: number | null
  value: string
}

interface TextInputCommitPlan {
  activeGlyphIndex: number
  cursorIndex: number
  glyphIds: string[]
  glyphsToAdd: GlyphAdditionCandidate[]
  text: string
}

const CJK_FULLWIDTH_RANGES: Array<[number, number]> = [
  [0x1100, 0x11ff],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe6f],
  [0xff00, 0xffef],
  [0x20000, 0x3134f],
]

const isCjkDefaultFullWidthCodePoint = (codePoint: number) =>
  CJK_FULLWIDTH_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end
  )

const formatUnicodeHex = (codePoint: number) =>
  codePoint <= 0xffff
    ? codePoint.toString(16).toUpperCase().padStart(4, '0')
    : codePoint.toString(16).toUpperCase()

const buildGlyphIdFromCharacter = (character: string) => {
  if (character === ' ') {
    return 'space'
  }

  const codePoint = character.codePointAt(0)
  if (!codePoint || /[\r\n\t]/.test(character)) {
    return null
  }

  if (/^[A-Za-z0-9]$/.test(character)) {
    return character
  }

  return codePoint <= 0xffff
    ? `uni${formatUnicodeHex(codePoint)}`
    : `u${formatUnicodeHex(codePoint)}`
}

const buildGlyphAdditionCandidate = (
  character: string,
  fontData: FontData | null
): GlyphAdditionCandidate | null => {
  const codePoint = character.codePointAt(0)
  const id = buildGlyphIdFromCharacter(character)
  if (!codePoint || !id) {
    return null
  }

  return {
    id,
    name: character === ' ' ? 'space' : character,
    unicode: formatUnicodeHex(codePoint),
    production: null,
    ...(isCjkDefaultFullWidthCodePoint(codePoint)
      ? { width: fontData?.unitsPerEm ?? 1000 }
      : {}),
  }
}

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
    const character = getGlyphUnicodeChar(glyph)
    if (!character) continue
    if (!entries.has(character)) {
      entries.set(character, glyph.id)
    }
  }

  return entries
}

export const buildTextInputCommitPlan = ({
  fontData,
  glyphIdByCharacter,
  selectionStart,
  value,
}: TextInputCommitOptions): TextInputCommitPlan => {
  const beforeCursor = value.slice(0, selectionStart ?? value.length)
  const glyphsToAddById = new Map<string, GlyphAdditionCandidate>()

  const resolveCharacter = (character: string) => {
    const glyphId = glyphIdByCharacter.get(character)
    if (glyphId) {
      return glyphId
    }

    const candidate = buildGlyphAdditionCandidate(character, fontData)
    if (!candidate) {
      return null
    }

    if (!fontData?.glyphs[candidate.id]) {
      glyphsToAddById.set(candidate.id, candidate)
    }
    return candidate.id
  }

  const supportedChars: string[] = []
  const glyphIds: string[] = []
  for (const character of Array.from(value)) {
    const glyphId = resolveCharacter(character)
    if (!glyphId) {
      continue
    }
    supportedChars.push(character)
    glyphIds.push(glyphId)
  }

  const cursorIndex = Array.from(beforeCursor).filter((character) =>
    Boolean(resolveCharacter(character))
  ).length

  return {
    activeGlyphIndex:
      glyphIds.length > 0
        ? Math.max(0, Math.min(cursorIndex - 1, glyphIds.length - 1))
        : 0,
    cursorIndex,
    glyphIds,
    glyphsToAdd: Array.from(glyphsToAddById.values()),
    text: supportedChars.join(''),
  }
}
