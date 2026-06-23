import { expect } from 'vitest'
import { buildAutoFeatureSuggestions } from 'src/lib/openTypeFeatures/buildAutoFeatureSuggestions'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import type {
  AutoFeatureSuggestion,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, GlyphData } from 'src/store/types'

export const makeGlyph = (name: string, unicode?: string): GlyphData => ({
  id: name,
  name,
  paths: [],
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  unicodes: unicode ? [unicode] : [],
})

export const makeFontData = (
  glyphs: Array<string | { name: string; unicode?: string }>
): FontData => {
  const glyphEntries = glyphs.map((glyph) => {
    const glyphData =
      typeof glyph === 'string'
        ? makeGlyph(glyph)
        : makeGlyph(glyph.name, glyph.unicode)
    return [glyphData.name, glyphData] as const
  })

  return {
    glyphs: Object.fromEntries(glyphEntries),
    glyphOrder: glyphEntries.map(([glyphName]) => glyphName),
    unitsPerEm: 1000,
  }
}

export const makeSuggestions = (fontData: FontData) =>
  buildAutoFeatureSuggestions(fontData, createEmptyOpenTypeFeaturesState())

export const findSuggestion = (
  suggestions: AutoFeatureSuggestion[],
  featureTag: string
) => {
  const suggestion = suggestions.find(
    (candidate) => candidate.featureTag === featureTag
  )
  expect(suggestion).toBeDefined()
  return suggestion as AutoFeatureSuggestion
}

export const ruleReplacements = (lookup: LookupRecord) =>
  lookup.rules.map((rule) => {
    if (
      rule.kind !== 'ligatureSubstitution' &&
      rule.kind !== 'singleSubstitution'
    ) {
      throw new Error(`Unexpected rule kind in test fixture: ${rule.kind}`)
    }
    return rule.replacement
  })

export const singleSubstitutionPairs = (lookup: LookupRecord) =>
  lookup.rules.map((rule) => {
    if (rule.kind !== 'singleSubstitution') {
      throw new Error(`Unexpected rule kind in test fixture: ${rule.kind}`)
    }
    if (rule.target.kind !== 'glyph') {
      throw new Error('Expected glyph selector in test fixture')
    }
    return `${rule.target.glyph}->${rule.replacement}`
  })

export const makeStateWithRule = (rule: Rule): OpenTypeFeaturesState => ({
  ...createEmptyOpenTypeFeaturesState(),
  features: [
    {
      id: 'feature_liga',
      tag: 'liga',
      isActive: true,
      origin: 'manual',
      entries: [
        {
          id: 'entry_liga_DFLT_dflt',
          script: 'DFLT',
          language: 'dflt',
          lookupIds: ['lookup_liga_manual'],
        },
      ],
    },
  ],
  lookups: [
    {
      id: 'lookup_liga_manual',
      name: 'lookup_liga_manual',
      table: 'GSUB',
      lookupType: 'ligatureSubst',
      lookupFlag: {},
      rules: [rule],
      editable: true,
      origin: 'manual',
    },
  ],
})
