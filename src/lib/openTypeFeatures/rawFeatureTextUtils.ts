import { toStableIdPart } from '@/lib/openTypeFeatures/ids'
import type { GlyphSelector } from '@/lib/openTypeFeatures/types'

export const FEA_NAME_PATTERN = '[A-Za-z_][A-Za-z0-9_.-]*'

export const stripComments = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .join('\n')

export const blankRange = (text: string, start: number, end: number) =>
  `${text.slice(0, start)}${' '.repeat(end - start)}${text.slice(end)}`

export const splitStatements = (body: string) =>
  body
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)

export const splitGlyphList = (body: string) =>
  body
    .split(/\s+/)
    .map((glyph) => glyph.trim())
    .filter(Boolean)

export const isInsideRange = (
  index: number,
  ranges: Array<{ start: number; end: number }>
) => ranges.some((range) => index > range.start && index < range.end)

export const makeLanguageSystemId = (script: string, language: string) =>
  `languagesystem_${toStableIdPart(script)}_${toStableIdPart(language)}`

export const makeGlyphClassId = (name: string) =>
  `glyph_class_raw_${toStableIdPart(name.replace(/^@/, ''))}`

export const makeMarkClassId = (name: string) =>
  `mark_class_raw_${toStableIdPart(name.replace(/^@/, ''))}`

export const selectorFromToken = (
  token: string,
  glyphClassIdByName: Map<string, string>
): GlyphSelector | null => {
  if (token.startsWith('@')) {
    const classId = glyphClassIdByName.get(token)
    return classId ? { kind: 'class', classId } : null
  }

  if (token.includes("'")) return null
  return { kind: 'glyph', glyph: token }
}

export const selectorFromMarkedToken = (
  token: string,
  glyphClassIdByName: Map<string, string>
) => {
  const marked = token.endsWith("'")
  const cleanToken = marked ? token.slice(0, -1) : token
  if (!cleanToken || cleanToken.includes("'")) return null
  const selector = selectorFromToken(cleanToken, glyphClassIdByName)
  return selector ? { marked, selector } : null
}
