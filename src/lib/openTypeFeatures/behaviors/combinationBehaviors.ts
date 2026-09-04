import { makeLookupId, makeRuleId } from '@/lib/openTypeFeatures/ids'
import {
  isFourCharTag,
  isValidGlyphName,
} from '@/lib/openTypeFeatures/validationNames'
import type {
  LigatureSubstitutionRule,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from '@/lib/openTypeFeatures/types'
import type { FontData } from '@/domain'
import {
  BEHAVIOR_TYPE_TO_FEATURE_TAG,
  FEATURE_TAG_TO_BEHAVIOR_TYPE,
} from '@/lib/openTypeFeatures/behaviorTypes'
import type {
  CombinationBehaviorDraft,
  CombinationBehaviorRow,
  CombinationBehaviorStatus,
} from '@/lib/openTypeFeatures/behaviorTypes'
import {
  ensureFeatureReferencesLookup,
  formatSourceLabel,
  mapFeatureTagsByLookupId,
  markFeatureOriginAsEdited,
  markLookupOriginAsEdited,
} from '@/lib/openTypeFeatures/behaviors/behaviorShared'

export function deriveGlyphCombinationBehaviors(
  fontData: FontData,
  glyphId: string
): CombinationBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countLigatureKeys(state.lookups)
  const inputKeys = countLigatureInputs(state.lookups)

  return state.lookups.flatMap((lookup) => {
    if (lookup.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
      return []
    }

    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'liga'
    const type = FEATURE_TAG_TO_BEHAVIOR_TYPE[featureTag] ?? 'customFeature'

    return lookup.rules
      .filter(isLigatureRule)
      .filter(
        (rule) =>
          rule.components.includes(glyphId) || rule.replacement === glyphId
      )
      .map((rule) => {
        const input = formatCombinationInput(rule.components)
        const output = rule.replacement
        const status = getCombinationStatus({
          fontData,
          input,
          output,
          duplicateCount:
            duplicateKeys.get(makeLigatureKey(rule.components, output)) ?? 0,
          inputCount: inputKeys.get(rule.components.join('+')) ?? 0,
        })

        return {
          id: `${lookup.id}:${rule.id}`,
          lookupId: lookup.id,
          ruleId: rule.id,
          input,
          output,
          type,
          featureTag,
          origin: rule.meta.origin,
          sourceLabel: formatSourceLabel(rule.meta.origin, featureTag),
          status,
        }
      })
  })
}

export function parseCombinationInput(input: string) {
  return input
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function suggestCombinationOutput(input: string) {
  return parseCombinationInput(input).join('_')
}

export function resolveCombinationFeatureTag(draft: CombinationBehaviorDraft) {
  if (draft.type === 'customFeature') {
    return draft.customFeatureTag?.trim() ?? ''
  }

  return BEHAVIOR_TYPE_TO_FEATURE_TAG[draft.type]
}

export function canCommitCombinationBehavior(draft: CombinationBehaviorDraft) {
  const components = parseCombinationInput(draft.input)
  const featureTag = resolveCombinationFeatureTag(draft)
  return (
    components.length > 0 &&
    components.every(isValidGlyphName) &&
    isValidGlyphName(draft.output.trim()) &&
    isFourCharTag(featureTag)
  )
}

export function upsertCombinationBehavior(
  state: OpenTypeFeaturesState,
  draft: CombinationBehaviorDraft
): OpenTypeFeaturesState {
  const components = parseCombinationInput(draft.input)
  const replacement = draft.output.trim()
  const featureTag = resolveCombinationFeatureTag(draft)
  if (
    components.length === 0 ||
    !replacement ||
    !components.every(isValidGlyphName) ||
    !isValidGlyphName(replacement) ||
    !isFourCharTag(featureTag)
  ) {
    return state
  }

  const nextState = deleteCombinationBehavior(state, draft)
  const lookupId = findWritableLigatureLookupId(nextState, featureTag)
  const rule = makeCombinationRule(featureTag, components, replacement)

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

  const nextLookupId = makeLookupId(featureTag, 'behavior_combinations')
  const lookup: LookupRecord = {
    id: nextLookupId,
    name: nextLookupId,
    table: 'GSUB',
    lookupType: 'ligatureSubst',
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

export function deleteCombinationBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<CombinationBehaviorDraft, 'lookupId' | 'ruleId'>
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
    lookups: state.lookups.map((lookup) =>
      lookup.id === target.lookupId
        ? {
            ...lookup,
            origin: markLookupOriginAsEdited(lookup.origin),
            rules: lookup.rules.filter((rule) => rule.id !== target.ruleId),
          }
        : lookup
    ),
  }
}

function countLigatureKeys(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
      continue
    }
    for (const rule of lookup.rules) {
      if (!isLigatureRule(rule)) continue
      const key = makeLigatureKey(rule.components, rule.replacement)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function countLigatureInputs(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
      continue
    }
    for (const rule of lookup.rules) {
      if (!isLigatureRule(rule)) continue
      const key = rule.components.join('+')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function getCombinationStatus(input: {
  fontData: FontData
  input: string
  output: string
  duplicateCount: number
  inputCount: number
}): CombinationBehaviorStatus[] {
  const components = parseCombinationInput(input.input)
  const status: CombinationBehaviorStatus[] = []
  if (
    components.length === 0 ||
    !components.every(isValidGlyphName) ||
    !isValidGlyphName(input.output)
  ) {
    status.push('Invalid Input')
  }
  if (
    components.some((component) => !input.fontData.glyphs[component]) ||
    !input.fontData.glyphs[input.output]
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

function formatCombinationInput(components: string[]) {
  return components.join('+')
}

function makeLigatureKey(components: string[], replacement: string) {
  return `${components.join('+')}=>${replacement}`
}

function isLigatureRule(rule: Rule): rule is LigatureSubstitutionRule {
  return rule.kind === 'ligatureSubstitution'
}

function findWritableLigatureLookupId(
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
      lookup.lookupType === 'ligatureSubst' &&
      lookup.editable
  )?.id
}

function makeCombinationRule(
  featureTag: string,
  components: string[],
  replacement: string
): LigatureSubstitutionRule {
  return {
    id: makeRuleId([featureTag, ...components, replacement]),
    kind: 'ligatureSubstitution',
    components,
    replacement,
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}
