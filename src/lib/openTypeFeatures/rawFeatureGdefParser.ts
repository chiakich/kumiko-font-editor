import { RAW_FEATURE_TEXT_SOURCE_ID } from 'src/lib/openTypeFeatures/featureSourceSections'
import type {
  FeatureOrigin,
  GdefState,
  GlyphClass,
} from 'src/lib/openTypeFeatures/types'
import {
  splitGlyphList,
  splitStatements,
} from 'src/lib/openTypeFeatures/rawFeatureTextUtils'

export const glyphsForGdefClassToken = (
  token: string,
  glyphClassIdByName: Map<string, string>,
  glyphClassById: Map<string, GlyphClass>
) => {
  const trimmed = token.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('@')) {
    const classId = glyphClassIdByName.get(trimmed)
    return classId ? (glyphClassById.get(classId)?.glyphs ?? null) : null
  }
  const bracketMatch = trimmed.match(/^\[([^\]]*)\]$/)
  return bracketMatch ? splitGlyphList(bracketMatch[1]) : [trimmed]
}

const markGlyphSetForGdefToken = (
  token: string,
  index: number,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassById: Map<string, GlyphClass>
): GlyphClass | null => {
  const trimmed = token.trim()
  if (trimmed.startsWith('@')) {
    const classId = glyphClassIdByName.get(trimmed)
    return classId ? (glyphClassById.get(classId) ?? null) : null
  }

  const glyphs = glyphsForGdefClassToken(
    trimmed,
    glyphClassIdByName,
    glyphClassById
  )
  return glyphs && glyphs.length > 0
    ? {
        id: `gdef_mark_glyph_set_raw_${index}`,
        name: `@GDEFMarkGlyphSet${index}`,
        glyphs,
        origin,
        meta: {
          sourceSectionId: RAW_FEATURE_TEXT_SOURCE_ID,
          classifiedFromRawFeatureText: true,
        },
      }
    : null
}

const parseGdefStatement = (
  statement: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassById: Map<string, GlyphClass>,
  gdef: GdefState
) => {
  const glyphClassDefMatch = statement.match(/^GlyphClassDef\s+(.+)$/i)
  if (glyphClassDefMatch) {
    const parts = glyphClassDefMatch[1].split(',').map((part) => part.trim())
    if (parts.length !== 4) return false
    const [base, ligature, mark, component] = parts.map((part) =>
      glyphsForGdefClassToken(part, glyphClassIdByName, glyphClassById)
    )
    if (!base || !ligature || !mark || !component) return false
    gdef.glyphClasses = {
      ...(base.length > 0 ? { base } : {}),
      ...(ligature.length > 0 ? { ligature } : {}),
      ...(mark.length > 0 ? { mark } : {}),
      ...(component.length > 0 ? { component } : {}),
    }
    return true
  }

  const markGlyphSetsMatch = statement.match(/^MarkGlyphSetsDef\s+(.+)$/i)
  if (markGlyphSetsMatch) {
    const markGlyphSet = markGlyphSetForGdefToken(
      markGlyphSetsMatch[1],
      gdef.markGlyphSets?.length ?? 0,
      origin,
      glyphClassIdByName,
      glyphClassById
    )
    if (!markGlyphSet) return false
    gdef.markGlyphSets = [...(gdef.markGlyphSets ?? []), markGlyphSet]
    return true
  }

  const ligatureCaretMatch = statement.match(
    /^LigatureCaretBy(Pos|Index)\s+(\S+)\s+(.+)$/i
  )
  if (ligatureCaretMatch) {
    const carets = ligatureCaretMatch[3]
      .trim()
      .split(/\s+/)
      .map((value) => (/^-?\d+$/.test(value) ? Number(value) : null))
    if (carets.some((value) => value === null)) return false
    gdef.ligatureCarets = [
      ...(gdef.ligatureCarets ?? []),
      {
        glyph: ligatureCaretMatch[2],
        carets: carets as number[],
        ...(ligatureCaretMatch[1].toLowerCase() === 'index'
          ? { format: 'pointIndex' as const }
          : {}),
      },
    ]
    return true
  }

  return false
}

export const parseGdefBlock = (
  body: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassById: Map<string, GlyphClass>
) => {
  const gdef: GdefState = {}
  const unsupportedStatements: string[] = []

  for (const statement of splitStatements(body)) {
    if (
      !parseGdefStatement(
        statement,
        origin,
        glyphClassIdByName,
        glyphClassById,
        gdef
      )
    ) {
      unsupportedStatements.push(statement)
    }
  }

  const hasGdef =
    Boolean(gdef.glyphClasses) ||
    Boolean(gdef.markGlyphSets?.length) ||
    Boolean(gdef.ligatureCarets?.length)

  return { gdef: hasGdef ? gdef : null, unsupportedStatements }
}
