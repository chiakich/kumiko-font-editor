import type {
  FeatureOrigin,
  GlyphSelector,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import {
  glyphsFromRawClassToken,
  isInlineGlyphClassToken,
  selectorFromRawMarkedToken,
  selectorFromRawToken,
  splitGlyphPatternTokens,
  type InlineGlyphClassRegistrar,
  type RawSelectorContext,
} from 'src/lib/openTypeFeatures/rawFeatureSelectorParser'
import { splitGlyphList } from 'src/lib/openTypeFeatures/rawFeatureTextUtils'

const SUBSTITUTION_KEYWORD = '(?:sub|substitute)'
const REVERSE_SUBSTITUTION_KEYWORD = 'rsub'

const matchSubstitutionStatement = (statement: string, bodyPattern: string) =>
  statement.match(
    new RegExp(`^${SUBSTITUTION_KEYWORD}\\s+${bodyPattern}$`, 'i')
  )

const matchReverseSubstitutionStatement = (
  statement: string,
  bodyPattern: string
) =>
  statement.match(
    new RegExp(`^${REVERSE_SUBSTITUTION_KEYWORD}\\s+${bodyPattern}$`, 'i')
  )

const makeGsubRuleMeta = (origin: FeatureOrigin) => ({
  origin,
  provenance: { table: 'GSUB' as const },
})

const parseReverseChainingSingleSubstitutionRules = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  selectorContext: RawSelectorContext
): Rule[] | null => {
  const reverseMatch = matchReverseSubstitutionStatement(
    statement,
    '(.+?)\\s+by\\s+(.+)'
  )
  if (!reverseMatch) return null

  const pattern = splitGlyphPatternTokens(reverseMatch[1])
  const replacement = splitGlyphPatternTokens(reverseMatch[2])
  if (!pattern || !replacement || replacement.length !== 1) return null

  const replacementGlyph = replacement[0]
  if (
    replacementGlyph.startsWith('@') ||
    replacementGlyph.includes("'") ||
    isInlineGlyphClassToken(replacementGlyph)
  ) {
    return null
  }

  const selectorEntries: Array<{
    marked: boolean
    selector: GlyphSelector
  }> = []
  for (const token of pattern) {
    const parsed = selectorFromRawMarkedToken(token, selectorContext)
    if (!parsed) return null
    selectorEntries.push(parsed)
  }

  if (selectorEntries.filter((entry) => entry.marked).length !== 1) {
    return null
  }

  const targetIndex = selectorEntries.findIndex((entry) => entry.marked)
  const target = selectorEntries[targetIndex]?.selector
  if (!target || target.kind !== 'glyph') return null

  return [
    {
      id: ruleId,
      kind: 'reverseChainingSingleSubstitution',
      backtrack: selectorEntries
        .slice(0, targetIndex)
        .map((entry) => entry.selector),
      target,
      lookahead: selectorEntries
        .slice(targetIndex + 1)
        .map((entry) => entry.selector),
      replacement: replacementGlyph,
      meta: makeGsubRuleMeta(origin),
    },
  ]
}

export const parseSubstitutionRules = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassGlyphsByName: Map<string, string[]>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule[] | null => {
  const selectorContext = {
    glyphClassIdByName,
    glyphClassGlyphsByName,
    registerInlineGlyphClass,
  }

  const reverseRules = parseReverseChainingSingleSubstitutionRules(
    statement,
    ruleId,
    origin,
    selectorContext
  )
  if (reverseRules) return reverseRules

  const alternateMatch = matchSubstitutionStatement(
    statement,
    '(\\S+)\\s+from\\s+\\[([^\\]]+)\\]'
  )
  if (alternateMatch) {
    const target = alternateMatch[1]
    const alternates = splitGlyphList(alternateMatch[2])
    if (
      target.startsWith('@') ||
      target.includes("'") ||
      alternates.length === 0 ||
      alternates.some((glyph) => glyph.startsWith('@') || glyph.includes("'"))
    ) {
      return null
    }

    return [
      {
        id: ruleId,
        kind: 'alternateSubstitution',
        target,
        alternates,
        meta: makeGsubRuleMeta(origin),
      },
    ]
  }

  const match = matchSubstitutionStatement(statement, '(.+?)\\s+by\\s+(.+)')
  if (!match) return null

  const pattern = splitGlyphPatternTokens(match[1])
  const replacement = splitGlyphPatternTokens(match[2])
  if (
    !pattern ||
    !replacement ||
    pattern.length === 0 ||
    replacement.length === 0 ||
    replacement.some((glyph) => glyph.includes("'"))
  ) {
    return null
  }

  const classTargetGlyphs =
    pattern.length === 1
      ? glyphsFromRawClassToken(pattern[0], selectorContext)
      : null
  const classReplacementGlyphs =
    replacement.length === 1
      ? glyphsFromRawClassToken(replacement[0], selectorContext)
      : null
  if (classTargetGlyphs || classReplacementGlyphs) {
    if (
      !classTargetGlyphs ||
      !classReplacementGlyphs ||
      classTargetGlyphs.length !== classReplacementGlyphs.length
    ) {
      return null
    }

    return classTargetGlyphs.map((glyph, index) => ({
      id: classTargetGlyphs.length === 1 ? ruleId : `${ruleId}_${index}`,
      kind: 'singleSubstitution',
      target: { kind: 'glyph', glyph },
      replacement: classReplacementGlyphs[index],
      meta: makeGsubRuleMeta(origin),
    }))
  }

  if (
    replacement.some(
      (glyph) => glyph.startsWith('@') || isInlineGlyphClassToken(glyph)
    )
  ) {
    return null
  }

  if (pattern.length === 1) {
    const target = selectorFromRawToken(pattern[0], selectorContext)
    if (!target) return null

    if (replacement.length === 1) {
      return [
        {
          id: ruleId,
          kind: 'singleSubstitution',
          target,
          replacement: replacement[0],
          meta: makeGsubRuleMeta(origin),
        },
      ]
    }

    return target.kind === 'glyph'
      ? [
          {
            id: ruleId,
            kind: 'multipleSubstitution',
            target: target.glyph,
            replacement,
            meta: makeGsubRuleMeta(origin),
          },
        ]
      : null
  }

  if (
    replacement.length !== 1 ||
    pattern.some(
      (token) =>
        token.startsWith('@') ||
        token.includes("'") ||
        isInlineGlyphClassToken(token)
    )
  ) {
    return null
  }

  return [
    {
      id: ruleId,
      kind: 'ligatureSubstitution',
      components: pattern,
      replacement: replacement[0],
      meta: makeGsubRuleMeta(origin),
    },
  ]
}
