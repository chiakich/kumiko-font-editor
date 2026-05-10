import {
  makeFeatureId,
  makeLookupId,
  makeRuleId,
  makeSuggestionId,
} from 'src/lib/openTypeFeatures/ids'
import type {
  AutoFeatureGeneratorName,
  AutoFeatureSuggestion,
  FeatureRecord,
  LookupRecord,
  Rule,
} from 'src/lib/openTypeFeatures/types'

const makeFeatureEntry = (featureTag: string, lookupId: string) => ({
  id: `entry_${featureTag}_DFLT_dflt`,
  script: 'DFLT',
  language: 'dflt',
  lookupIds: [lookupId],
})

export const createLookupSuggestion = (input: {
  featureTag: string
  lookupType: LookupRecord['lookupType']
  table: LookupRecord['table']
  rules: Rule[]
  reason: string
  generator: AutoFeatureGeneratorName
  existingFeature?: FeatureRecord
}): AutoFeatureSuggestion => {
  const lookupId = makeLookupId(input.featureTag, input.generator)
  const lookup: LookupRecord = {
    id: lookupId,
    name: lookupId,
    table: input.table,
    lookupType: input.lookupType,
    lookupFlag: {},
    rules: input.rules,
    editable: true,
    origin: 'auto',
  }
  return {
    id: makeSuggestionId(
      input.featureTag,
      input.rules.map((rule) => rule.id)
    ),
    featureTag: input.featureTag,
    lookup,
    ruleIds: input.rules.map((rule) => rule.id),
    confidence: input.rules.every((rule) => rule.meta.confidence === 'high')
      ? 'high'
      : 'medium',
    reason: input.reason,
    status: 'pending',
  }
}

export const makeSingleSubstitutionRule = (input: {
  source: string
  replacement: string
  featureTag: string
  generator: AutoFeatureGeneratorName
  confidence?: 'high' | 'medium' | 'low'
  reason: string
}): Rule => ({
  id: makeRuleId([input.featureTag, input.source, input.replacement]),
  kind: 'singleSubstitution',
  target: { kind: 'glyph', glyph: input.source },
  replacement: input.replacement,
  meta: {
    origin: 'auto',
    generator: input.generator,
    confidence: input.confidence ?? 'high',
    reason: input.reason,
  },
})

export const makeLigatureRule = (input: {
  components: string[]
  replacement: string
  featureTag: string
  confidence?: 'high' | 'medium' | 'low'
  reason: string
}): Rule => ({
  id: makeRuleId([input.featureTag, ...input.components, input.replacement]),
  kind: 'ligatureSubstitution',
  components: input.components,
  replacement: input.replacement,
  meta: {
    origin: 'auto',
    generator: 'glyph-name-ligature',
    confidence: input.confidence ?? 'high',
    reason: input.reason,
  },
})

export const createFeatureRecordForSuggestion = (
  featureTag: string,
  lookupId: string
): FeatureRecord => ({
  id: makeFeatureId(featureTag),
  tag: featureTag,
  isActive: true,
  entries: [makeFeatureEntry(featureTag, lookupId)],
  origin: 'auto',
})
