import { makeLookupId, makeRuleId } from '@/lib/openTypeFeatures/ids'
import { isValidGlyphName } from '@/lib/openTypeFeatures/validationNames'
import type {
  ContextualRule,
  LookupRecord,
  OpenTypeFeaturesState,
  SingleSubstitutionRule,
} from '@/lib/openTypeFeatures/types'
import type { FontData } from '@/domain'
import type {
  ContextualBehaviorDraft,
  ContextualBehaviorRow,
  ContextualBehaviorStatus,
} from '@/lib/openTypeFeatures/behaviorTypes'
import {
  ensureFeatureReferencesLookup,
  formatSourceLabel,
  makeSingleSubstitutionRule,
  mapFeatureTagsByLookupId,
  markFeatureOriginAsEdited,
  markLookupOriginAsEdited,
} from '@/lib/openTypeFeatures/behaviors/behaviorShared'

export function deriveGlyphContextualBehaviors(
  fontData: FontData,
  glyphId: string
): ContextualBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countContextualKeys(state.lookups, lookupById)

  return state.lookups.flatMap((lookup) => {
    if (
      lookup.table !== 'GSUB' ||
      (lookup.lookupType !== 'contextSubst' &&
        lookup.lookupType !== 'chainingContextSubst')
    ) {
      return []
    }
    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'calt'
    if (featureTag !== 'calt') return []

    return lookup.rules.flatMap((rule) => {
      if (
        rule.kind !== 'contextualSubstitution' ||
        rule.input.length !== 1 ||
        rule.input[0]?.selector.kind !== 'glyph'
      ) {
        return []
      }

      const source = rule.input[0].selector.glyph
      const replacement = resolveContextualReplacement(
        rule.input[0].lookupIds,
        lookupById
      )
      if (!replacement) return []

      const before = formatContextTokens(rule.backtrack)
      const after = formatContextTokens(rule.lookahead)
      if (
        source !== glyphId &&
        replacement !== glyphId &&
        !parseContextInput(before).includes(glyphId) &&
        !parseContextInput(after).includes(glyphId)
      ) {
        return []
      }

      return [
        {
          id: `${lookup.id}:${rule.id}`,
          lookupId: lookup.id,
          ruleId: rule.id,
          source,
          replacement,
          before,
          after,
          featureTag,
          origin: rule.meta.origin,
          sourceLabel: formatSourceLabel(rule.meta.origin, featureTag),
          status: getContextualStatus({
            fontData,
            source,
            replacement,
            before,
            after,
            duplicateCount:
              duplicateKeys.get(
                makeContextualKey(source, replacement, before, after)
              ) ?? 0,
          }),
        },
      ]
    })
  })
}

export function canCommitContextualBehavior(draft: ContextualBehaviorDraft) {
  const before = parseContextInput(draft.before)
  const after = parseContextInput(draft.after)
  return (
    isValidGlyphName(draft.source.trim()) &&
    isValidGlyphName(draft.replacement.trim()) &&
    [...before, ...after].every(isValidGlyphName) &&
    (before.length > 0 || after.length > 0)
  )
}

export function upsertContextualBehavior(
  state: OpenTypeFeaturesState,
  draft: ContextualBehaviorDraft
): OpenTypeFeaturesState {
  const source = draft.source.trim()
  const replacement = draft.replacement.trim()
  const before = parseContextInput(draft.before)
  const after = parseContextInput(draft.after)
  if (!canCommitContextualBehavior(draft)) return state

  const nextState = deleteContextualBehavior(state, draft)
  const helperLookup = makeContextualHelperLookup(source, replacement)
  const contextLookupId =
    findWritableContextualLookupId(nextState) ??
    makeLookupId('calt', 'behavior_contextual')
  const helperLookupExists = nextState.lookups.some(
    (lookup) => lookup.id === helperLookup.id
  )
  const contextRule = makeContextualRule({
    source,
    replacement,
    before,
    after,
    helperLookupId: helperLookup.id,
  })
  const contextLookupExists = nextState.lookups.some(
    (lookup) => lookup.id === contextLookupId
  )

  return {
    ...nextState,
    features: ensureFeatureReferencesLookup(
      nextState.features,
      'calt',
      contextLookupId
    ),
    lookups: [
      ...nextState.lookups.map((lookup) => {
        if (lookup.id === contextLookupId) {
          return {
            ...lookup,
            origin: markLookupOriginAsEdited(lookup.origin),
            rules: [...lookup.rules, contextRule],
          }
        }
        return lookup
      }),
      ...(contextLookupExists
        ? []
        : [
            {
              id: contextLookupId,
              name: contextLookupId,
              table: 'GSUB' as const,
              lookupType: 'chainingContextSubst' as const,
              lookupFlag: {},
              rules: [contextRule],
              editable: true,
              origin: 'manual' as const,
            },
          ]),
      ...(helperLookupExists ? [] : [helperLookup]),
    ],
  }
}

export function deleteContextualBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<ContextualBehaviorDraft, 'lookupId' | 'ruleId'>
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

function parseContextInput(input: string) {
  return input
    .split(/[+\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function formatContextTokens(
  selectors: Array<{ kind: string; glyph?: string }>
) {
  return selectors
    .map((selector) => (selector.kind === 'glyph' ? selector.glyph : null))
    .filter((glyph): glyph is string => Boolean(glyph))
    .join('+')
}

function countContextualKeys(
  lookups: LookupRecord[],
  lookupById: Map<string, LookupRecord>
) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (
      lookup.table !== 'GSUB' ||
      (lookup.lookupType !== 'contextSubst' &&
        lookup.lookupType !== 'chainingContextSubst')
    ) {
      continue
    }
    for (const rule of lookup.rules) {
      if (
        rule.kind !== 'contextualSubstitution' ||
        rule.input.length !== 1 ||
        rule.input[0]?.selector.kind !== 'glyph'
      ) {
        continue
      }
      const source = rule.input[0].selector.glyph
      const replacement = resolveContextualReplacement(
        rule.input[0].lookupIds,
        lookupById
      )
      if (!replacement) continue
      const key = makeContextualKey(
        source,
        replacement,
        formatContextTokens(rule.backtrack),
        formatContextTokens(rule.lookahead)
      )
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function resolveContextualReplacement(
  lookupIds: string[] | undefined,
  lookupById: Map<string, LookupRecord>
) {
  for (const lookupId of lookupIds ?? []) {
    const lookup = lookupById.get(lookupId)
    const rule = lookup?.rules.find(
      (candidate): candidate is SingleSubstitutionRule =>
        candidate.kind === 'singleSubstitution' &&
        candidate.target.kind === 'glyph'
    )
    if (rule) return rule.replacement
  }
  return null
}

function makeContextualKey(
  source: string,
  replacement: string,
  before: string,
  after: string
) {
  return `${before}|${source}->${replacement}|${after}`
}

function getContextualStatus(input: {
  fontData: FontData
  source: string
  replacement: string
  before: string
  after: string
  duplicateCount: number
}): ContextualBehaviorStatus[] {
  const status: ContextualBehaviorStatus[] = []
  const contextGlyphs = [
    ...parseContextInput(input.before),
    ...parseContextInput(input.after),
  ]
  if (
    !isValidGlyphName(input.source) ||
    !isValidGlyphName(input.replacement) ||
    !contextGlyphs.every(isValidGlyphName) ||
    contextGlyphs.length === 0
  ) {
    status.push('Invalid Input')
  }
  if (
    !input.fontData.glyphs[input.source] ||
    !input.fontData.glyphs[input.replacement] ||
    contextGlyphs.some((glyph) => !input.fontData.glyphs[glyph])
  ) {
    status.push('Missing Glyph')
  }
  if (input.duplicateCount > 1) {
    status.push('Duplicate')
  }
  return status
}

function findWritableContextualLookupId(state: OpenTypeFeaturesState) {
  const feature = state.features.find((item) => item.tag === 'calt')
  const lookupIds = new Set(
    feature?.entries.flatMap((entry) => entry.lookupIds)
  )

  return state.lookups.find(
    (lookup) =>
      lookupIds.has(lookup.id) &&
      lookup.table === 'GSUB' &&
      (lookup.lookupType === 'contextSubst' ||
        lookup.lookupType === 'chainingContextSubst') &&
      lookup.editable
  )?.id
}

function makeContextualHelperLookup(
  source: string,
  replacement: string
): LookupRecord {
  const lookupId = makeLookupId(
    'calt',
    `behavior_contextual_${source}_${replacement}`
  )
  return {
    id: lookupId,
    name: lookupId,
    table: 'GSUB',
    lookupType: 'singleSubst',
    lookupFlag: {},
    rules: [makeSingleSubstitutionRule('calt', source, replacement)],
    editable: true,
    origin: 'manual',
  }
}

function makeContextualRule(input: {
  source: string
  replacement: string
  before: string[]
  after: string[]
  helperLookupId: string
}): ContextualRule {
  return {
    id: makeRuleId([
      'calt',
      ...input.before,
      input.source,
      input.replacement,
      ...input.after,
    ]),
    kind: 'contextualSubstitution',
    mode: input.before.length > 0 ? 'chaining' : 'context',
    backtrack: input.before.map((glyph) => ({ kind: 'glyph', glyph })),
    input: [
      {
        selector: { kind: 'glyph', glyph: input.source },
        lookupIds: [input.helperLookupId],
      },
    ],
    lookahead: input.after.map((glyph) => ({ kind: 'glyph', glyph })),
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}
