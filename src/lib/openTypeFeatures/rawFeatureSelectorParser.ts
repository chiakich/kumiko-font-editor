import type { GlyphSelector } from 'src/lib/openTypeFeatures/types'
import {
  selectorFromMarkedToken,
  selectorFromToken,
  splitGlyphList,
} from 'src/lib/openTypeFeatures/rawFeatureTextUtils'

export type InlineGlyphClassRegistrar = (glyphs: string[]) => string | null

export interface RawSelectorContext {
  glyphClassIdByName: Map<string, string>
  glyphClassGlyphsByName?: Map<string, string[]>
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
}

export const splitFirstGlyphPatternToken = (
  body: string
): { rest: string; token: string } | null => {
  const trimmed = body.trimStart()
  if (!trimmed) return null

  if (trimmed.startsWith('[')) {
    const endIndex = trimmed.indexOf(']')
    if (endIndex < 0) return null

    let tokenEnd = endIndex + 1
    if (trimmed[tokenEnd] === "'") {
      tokenEnd += 1
    }

    const nextCharacter = trimmed[tokenEnd]
    if (nextCharacter && !/\s/.test(nextCharacter)) return null

    return {
      token: trimmed.slice(0, tokenEnd),
      rest: trimmed.slice(tokenEnd).trim(),
    }
  }

  const token = trimmed.match(/^\S+/)?.[0]
  return token
    ? {
        token,
        rest: trimmed.slice(token.length).trim(),
      }
    : null
}

export const splitGlyphPatternTokens = (body: string) => {
  const tokens: string[] = []
  let rest = body.trim()

  while (rest) {
    const parsed = splitFirstGlyphPatternToken(rest)
    if (!parsed) return null
    tokens.push(parsed.token)
    rest = parsed.rest
  }

  return tokens
}

export const splitCommaSeparatedContexts = (body: string) => {
  const contexts: string[] = []
  let bracketDepth = 0
  let startIndex = 0

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (character === '[') {
      bracketDepth += 1
      continue
    }
    if (character === ']') {
      bracketDepth -= 1
      if (bracketDepth < 0) return null
      continue
    }
    if (character !== ',' || bracketDepth !== 0) continue

    const context = body.slice(startIndex, index).trim()
    if (!context) return null
    contexts.push(context)
    startIndex = index + 1
  }

  if (bracketDepth !== 0) return null

  const finalContext = body.slice(startIndex).trim()
  if (!finalContext) return null
  contexts.push(finalContext)
  return contexts
}

const parseInlineGlyphClassToken = (token: string) => {
  const marked = token.endsWith("'")
  const cleanToken = marked ? token.slice(0, -1) : token
  const match = cleanToken.match(/^\[([^\]]+)\]$/)
  if (!match) return null

  const glyphs = splitGlyphList(match[1])
  if (
    glyphs.length === 0 ||
    glyphs.some(
      (glyph) =>
        glyph.startsWith('@') ||
        glyph.includes("'") ||
        glyph.includes('[') ||
        glyph.includes(']')
    )
  ) {
    return null
  }

  return { glyphs, marked }
}

export const isInlineGlyphClassToken = (token: string) =>
  Boolean(parseInlineGlyphClassToken(token))

export const glyphsFromRawClassToken = (
  token: string,
  context: RawSelectorContext
) => {
  const inlineClass = parseInlineGlyphClassToken(token)
  if (inlineClass) {
    return inlineClass.marked ? null : inlineClass.glyphs
  }

  if (!token.startsWith('@') || token.includes("'")) return null
  return context.glyphClassGlyphsByName?.get(token) ?? null
}

export const selectorFromRawToken = (
  token: string,
  context: RawSelectorContext
): GlyphSelector | null => {
  const inlineClass = parseInlineGlyphClassToken(token)
  if (inlineClass) {
    if (inlineClass.marked) return null
    const classId = context.registerInlineGlyphClass?.(inlineClass.glyphs)
    return classId ? { kind: 'class', classId } : null
  }

  return selectorFromToken(token, context.glyphClassIdByName)
}

export const selectorFromRawMarkedToken = (
  token: string,
  context: RawSelectorContext
) => {
  const inlineClass = parseInlineGlyphClassToken(token)
  if (inlineClass) {
    const classId = context.registerInlineGlyphClass?.(inlineClass.glyphs)
    return classId
      ? {
          marked: inlineClass.marked,
          selector: { kind: 'class' as const, classId },
        }
      : null
  }

  return selectorFromMarkedToken(token, context.glyphClassIdByName)
}
