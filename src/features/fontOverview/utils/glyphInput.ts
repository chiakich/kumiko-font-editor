import type { GlyphNameInfo } from '@/lib/glyph/glyphNameInfo'

export interface GlyphAdditionCandidate {
  id: string
  name: string
  unicode: string | null
  production: string | null
  recipe?: string
  width?: number
}

const MAX_RANGE_GLYPHS = 5000

const CJK_FULLWIDTH_RANGES: Array<[number, number]> = [
  [0x1100, 0x11ff],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe6f],
  [0xff00, 0xffef],
  [0x20000, 0x3134f],
]

export const isCjkDefaultFullWidthCodePoint = (codePoint: number) =>
  CJK_FULLWIDTH_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end
  )

const formatUnicodeHex = (codePoint: number) =>
  codePoint <= 0xffff
    ? codePoint.toString(16).toUpperCase().padStart(4, '0')
    : codePoint.toString(16).toUpperCase()

const buildGlyphIdFromChar = (character: string) => {
  const codePoint = character.codePointAt(0)
  if (!codePoint) {
    return null
  }

  if (/^[A-Za-z0-9]$/.test(character)) {
    return character
  }

  return codePoint <= 0xffff
    ? `uni${formatUnicodeHex(codePoint)}`
    : `u${formatUnicodeHex(codePoint)}`
}

// Resolve a glyph name to its Unicode and production name. uniXXXX/single-char
// names are derivable; everything else (leftArrow, verticalbar) needs the
// GlyphData lookup map, which the caller loads via getGlyphNameInfoMap.
const resolveGlyphInfo = (
  glyphName: string,
  infoMap?: Map<string, GlyphNameInfo>
): GlyphNameInfo => {
  if (glyphName.length === 1) {
    return {
      unicode: formatUnicodeHex(glyphName.codePointAt(0) ?? 0),
      production: null,
    }
  }

  const uniMatch = glyphName.match(/^uni([0-9a-fA-F]{4,6})$/)
  if (uniMatch?.[1]) {
    return { unicode: uniMatch[1].toUpperCase(), production: null }
  }

  const uMatch = glyphName.match(/^u([0-9a-fA-F]{5,6})$/)
  if (uMatch?.[1]) {
    return { unicode: uMatch[1].toUpperCase(), production: null }
  }

  return infoMap?.get(glyphName) ?? { unicode: null, production: null }
}

const isGlyphName = (token: string) =>
  /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(token)

const createGlyphNameCandidate = (
  glyphName: string,
  infoMap?: Map<string, GlyphNameInfo>,
  recipe?: string
): GlyphAdditionCandidate => {
  const info = resolveGlyphInfo(glyphName, infoMap)
  return {
    id: glyphName,
    name: glyphName,
    unicode: info.unicode,
    production: info.production,
    ...(recipe ? { recipe } : {}),
  }
}

const createCharacterCandidates = (token: string) =>
  Array.from(token).flatMap((character): GlyphAdditionCandidate[] => {
    const id = buildGlyphIdFromChar(character)
    const codePoint = character.codePointAt(0)
    if (!id || !codePoint || /\s/.test(character)) {
      return []
    }

    return [
      {
        id,
        name: character,
        unicode: formatUnicodeHex(codePoint),
        production: null,
      },
    ]
  })

const parseUnicodeRange = (token: string) => {
  const match = token.match(
    /^(uni|u)([0-9a-fA-F]{4,6}):(uni|u)([0-9a-fA-F]{4,6})$/
  )
  if (!match?.[2] || !match[4]) {
    return null
  }

  const start = Number.parseInt(match[2], 16)
  const end = Number.parseInt(match[4], 16)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null
  }

  const count = end - start + 1
  if (count > MAX_RANGE_GLYPHS) {
    return null
  }

  return Array.from({ length: count }, (_, index) => {
    const codePoint = start + index
    const unicode = formatUnicodeHex(codePoint)
    return createGlyphNameCandidate(
      codePoint <= 0xffff ? `uni${unicode}` : `u${unicode}`
    )
  })
}

const parseRecipe = (token: string, infoMap?: Map<string, GlyphNameInfo>) => {
  const [source, target, extra] = token.split('=')
  if (!source || !target || extra !== undefined || !isGlyphName(target)) {
    return null
  }

  const sourceGlyphNames = source.split('+')
  if (
    sourceGlyphNames.length === 0 ||
    !sourceGlyphNames.every((glyphName) => isGlyphName(glyphName))
  ) {
    return null
  }

  return [createGlyphNameCandidate(target, infoMap, source)]
}

const parseGlyphToken = (
  token: string,
  infoMap?: Map<string, GlyphNameInfo>
): GlyphAdditionCandidate[] => {
  const rangeCandidates = parseUnicodeRange(token)
  if (rangeCandidates) {
    return rangeCandidates
  }

  const recipeCandidates = parseRecipe(token, infoMap)
  if (recipeCandidates) {
    return recipeCandidates
  }

  if (isGlyphName(token)) {
    return [createGlyphNameCandidate(token, infoMap)]
  }

  return createCharacterCandidates(token)
}

export const parseGlyphAdditionInput = (
  input: string,
  infoMap?: Map<string, GlyphNameInfo>
) => {
  const results: GlyphAdditionCandidate[] = []
  const seen = new Set<string>()

  for (const token of input.split(/\s+/).filter(Boolean)) {
    for (const candidate of parseGlyphToken(token, infoMap)) {
      if (seen.has(candidate.id)) {
        continue
      }

      results.push(candidate)
      seen.add(candidate.id)
    }
  }

  return results
}
