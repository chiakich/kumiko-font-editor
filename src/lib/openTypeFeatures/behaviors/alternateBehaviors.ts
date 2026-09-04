import { makeLookupId } from '@/lib/openTypeFeatures/ids'
import {
  isFourCharTag,
  isValidGlyphName,
} from '@/lib/openTypeFeatures/validationNames'
import type {
  AlternateSubstitutionRule,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
  SingleSubstitutionRule,
} from '@/lib/openTypeFeatures/types'
import type { FontData } from '@/domain'
import {
  ALTERNATE_TYPE_TO_FEATURE_TAG,
  FEATURE_TAG_TO_ALTERNATE_TYPE,
} from '@/lib/openTypeFeatures/behaviorTypes'
import type {
  AlternateBehaviorDraft,
  AlternateBehaviorRow,
  AlternateBehaviorStatus,
  AlternateBehaviorType,
} from '@/lib/openTypeFeatures/behaviorTypes'
import {
  ensureFeatureReferencesLookup,
  formatSourceLabel,
  isAlternateSubstitutionRule,
  makeSingleSubstitutionRule,
  mapFeatureTagsByLookupId,
  markFeatureOriginAsEdited,
  markLookupOriginAsEdited,
} from '@/lib/openTypeFeatures/behaviors/behaviorShared'

export function deriveGlyphAlternateBehaviors(
  fontData: FontData,
  glyphId: string
): AlternateBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countAlternateKeys(state.lookups)
  const inputKeys = countAlternateSources(state.lookups)

  return state.lookups.flatMap((lookup) => {
    if (
      lookup.table !== 'GSUB' ||
      (lookup.lookupType !== 'singleSubst' &&
        lookup.lookupType !== 'alternateSubst')
    ) {
      return []
    }

    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'salt'
    const type = FEATURE_TAG_TO_ALTERNATE_TYPE[featureTag] ?? 'customFeature'

    return lookup.rules.flatMap((rule) => {
      if (isSingleSubstitutionRule(rule)) {
        if (
          rule.target.kind !== 'glyph' ||
          (rule.target.glyph !== glyphId && rule.replacement !== glyphId)
        ) {
          return []
        }
        return [
          makeAlternateRow({
            fontData,
            lookup,
            rule,
            source: rule.target.glyph,
            alternate: rule.replacement,
            featureTag,
            type,
            duplicateCount:
              duplicateKeys.get(
                makeAlternateKey(rule.target.glyph, rule.replacement)
              ) ?? 0,
            inputCount: inputKeys.get(rule.target.glyph) ?? 0,
          }),
        ]
      }

      if (isAlternateSubstitutionRule(rule)) {
        if (rule.target !== glyphId && !rule.alternates.includes(glyphId)) {
          return []
        }
        return rule.alternates.map((alternate) =>
          makeAlternateRow({
            fontData,
            lookup,
            rule,
            source: rule.target,
            alternate,
            featureTag,
            type,
            duplicateCount:
              duplicateKeys.get(makeAlternateKey(rule.target, alternate)) ?? 0,
            inputCount: inputKeys.get(rule.target) ?? 0,
          })
        )
      }

      return []
    })
  })
}

export function suggestAlternateGlyphName(source: string) {
  return source ? `${source}.alt` : ''
}

export function resolveAlternateFeatureTag(draft: AlternateBehaviorDraft) {
  if (draft.type === 'customFeature') {
    return draft.customFeatureTag?.trim() ?? ''
  }

  return ALTERNATE_TYPE_TO_FEATURE_TAG[draft.type]
}

export function canCommitAlternateBehavior(draft: AlternateBehaviorDraft) {
  const featureTag = resolveAlternateFeatureTag(draft)
  return (
    isValidGlyphName(draft.source.trim()) &&
    isValidGlyphName(draft.alternate.trim()) &&
    isFourCharTag(featureTag)
  )
}

export function upsertAlternateBehavior(
  state: OpenTypeFeaturesState,
  draft: AlternateBehaviorDraft
): OpenTypeFeaturesState {
  const source = draft.source.trim()
  const alternate = draft.alternate.trim()
  const featureTag = resolveAlternateFeatureTag(draft)
  if (
    !isValidGlyphName(source) ||
    !isValidGlyphName(alternate) ||
    !isFourCharTag(featureTag)
  ) {
    return state
  }

  const nextState = deleteAlternateBehavior(state, draft)
  const lookupId = findWritableSingleSubstitutionLookupId(nextState, featureTag)
  const rule = makeSingleSubstitutionRule(featureTag, source, alternate)

  if (lookupId) {
    return {
      ...nextState,
      features: ensureFeatureReferencesLookup(
        nextState.features,
        featureTag,
        lookupId
      ),
      lookups: nextState.lookups.map((lookup) =>
        lookup.id === lookupId
          ? {
              ...lookup,
              origin: markLookupOriginAsEdited(lookup.origin),
              rules: [...lookup.rules, rule],
            }
          : lookup
      ),
    }
  }

  const nextLookupId = makeLookupId(featureTag, 'behavior_alternates')
  const lookup: LookupRecord = {
    id: nextLookupId,
    name: nextLookupId,
    table: 'GSUB',
    lookupType: 'singleSubst',
    lookupFlag: {},
    rules: [rule],
    editable: true,
    origin: 'manual',
  }

  return {
    ...nextState,
    features: ensureFeatureReferencesLookup(
      nextState.features,
      featureTag,
      nextLookupId
    ),
    lookups: [...nextState.lookups, lookup],
  }
}

export function deleteAlternateBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<AlternateBehaviorDraft, 'lookupId' | 'ruleId' | 'alternate'>
): OpenTypeFeaturesState {
  if (!target.lookupId || !target.ruleId) return state

  return {
    ...state,
    features: state.features.map((feature) =>
      feature.entries.some((entry) =>
        entry.lookupIds.includes(target.lookupId ?? '')
      )
        ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
        : feature
    ),
    lookups: state.lookups.map((lookup) => {
      if (lookup.id !== target.lookupId) return lookup

      return {
        ...lookup,
        origin: markLookupOriginAsEdited(lookup.origin),
        rules: lookup.rules.flatMap((rule) => {
          if (rule.id !== target.ruleId) return [rule]
          if (!isAlternateSubstitutionRule(rule)) return []

          const alternates = rule.alternates.filter(
            (alternate) => alternate !== target.alternate
          )
          return alternates.length > 0 ? [{ ...rule, alternates }] : []
        }),
      }
    }),
  }
}

function makeAlternateRow(input: {
  fontData: FontData
  lookup: LookupRecord
  rule: SingleSubstitutionRule | AlternateSubstitutionRule
  source: string
  alternate: string
  featureTag: string
  type: AlternateBehaviorType
  duplicateCount: number
  inputCount: number
}): AlternateBehaviorRow {
  return {
    id: `${input.lookup.id}:${input.rule.id}:${input.alternate}`,
    lookupId: input.lookup.id,
    ruleId: input.rule.id,
    source: input.source,
    alternate: input.alternate,
    type: input.type,
    featureTag: input.featureTag,
    origin: input.rule.meta.origin,
    sourceLabel: formatSourceLabel(input.rule.meta.origin, input.featureTag),
    status: getAlternateStatus(input),
  }
}

function getAlternateStatus(input: {
  fontData: FontData
  source: string
  alternate: string
  duplicateCount: number
  inputCount: number
}): AlternateBehaviorStatus[] {
  const status: AlternateBehaviorStatus[] = []
  if (!isValidGlyphName(input.source) || !isValidGlyphName(input.alternate)) {
    status.push('Invalid Input')
  }
  if (
    !input.fontData.glyphs[input.source] ||
    !input.fontData.glyphs[input.alternate]
  ) {
    status.push('Missing Glyph')
  }
  if (input.duplicateCount > 1) {
    status.push('Duplicate')
  }
  if (input.inputCount > 1 && input.duplicateCount === 1) {
    status.push('Conflict')
  }
  return status
}

function countAlternateKeys(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB') continue
    for (const rule of lookup.rules) {
      if (isSingleSubstitutionRule(rule) && rule.target.kind === 'glyph') {
        const key = makeAlternateKey(rule.target.glyph, rule.replacement)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      if (isAlternateSubstitutionRule(rule)) {
        for (const alternate of rule.alternates) {
          const key = makeAlternateKey(rule.target, alternate)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  return counts
}

function countAlternateSources(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB') continue
    for (const rule of lookup.rules) {
      if (isSingleSubstitutionRule(rule) && rule.target.kind === 'glyph') {
        counts.set(rule.target.glyph, (counts.get(rule.target.glyph) ?? 0) + 1)
      }
      if (isAlternateSubstitutionRule(rule)) {
        counts.set(
          rule.target,
          (counts.get(rule.target) ?? 0) + rule.alternates.length
        )
      }
    }
  }
  return counts
}

function makeAlternateKey(source: string, alternate: string) {
  return `${source}=>${alternate}`
}

function isSingleSubstitutionRule(rule: Rule): rule is SingleSubstitutionRule {
  return rule.kind === 'singleSubstitution'
}

function findWritableSingleSubstitutionLookupId(
  state: OpenTypeFeaturesState,
  featureTag: string
) {
  const feature = state.features.find((item) => item.tag === featureTag)
  const lookupIds = new Set(
    feature?.entries.flatMap((entry) => entry.lookupIds)
  )

  return state.lookups.find(
    (lookup) =>
      lookupIds.has(lookup.id) &&
      lookup.table === 'GSUB' &&
      lookup.lookupType === 'singleSubst' &&
      lookup.editable
  )?.id
}
