import type {
  FeatureRecord,
  GposLookupType,
  GsubLookupType,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from '@/lib/openTypeFeatures'

// The rule kinds the visual editor can author from scratch. Everything else
// still enters through FEA code or import.
export type CreatableRuleKind =
  | 'singleSubstitution'
  | 'ligatureSubstitution'
  | 'pairPositioning'

interface RuleShape {
  table: 'GSUB' | 'GPOS'
  lookupType: GsubLookupType | GposLookupType
  makeBlankRule: (id: string) => Rule
}

const RULE_SHAPES: Record<CreatableRuleKind, RuleShape> = {
  singleSubstitution: {
    table: 'GSUB',
    lookupType: 'singleSubst',
    makeBlankRule: (id) => ({
      id,
      kind: 'singleSubstitution',
      target: { kind: 'glyph', glyph: '' },
      replacement: '',
      meta: { origin: 'manual', userOverridden: true, dirty: true },
    }),
  },
  ligatureSubstitution: {
    table: 'GSUB',
    lookupType: 'ligatureSubst',
    makeBlankRule: (id) => ({
      id,
      kind: 'ligatureSubstitution',
      components: [],
      replacement: '',
      meta: { origin: 'manual', userOverridden: true, dirty: true },
    }),
  },
  pairPositioning: {
    table: 'GPOS',
    lookupType: 'pairPos',
    makeBlankRule: (id) => ({
      id,
      kind: 'pairPositioning',
      left: { kind: 'glyph', glyph: '' },
      right: { kind: 'glyph', glyph: '' },
      firstValue: { xAdvance: 0 },
      meta: { origin: 'manual', userOverridden: true, dirty: true },
    }),
  },
}

export const VALID_FEATURE_TAG = /^[a-z][a-z0-9]{3}$/

// Ids only need to be unique within the state; a numeric suffix over the
// existing set keeps them readable and deterministic per call.
const uniqueId = (prefix: string, existing: ReadonlySet<string>) => {
  let index = 1
  while (existing.has(`${prefix}_${index}`)) {
    index += 1
  }
  return `${prefix}_${index}`
}

const collectRuleIds = (state: OpenTypeFeaturesState) =>
  new Set(state.lookups.flatMap((lookup) => lookup.rules.map((r) => r.id)))

// Adds a blank rule of the given kind to the feature: reuses the feature's
// last editable lookup of the matching type, or creates one and references it
// from every entry of the feature.
export function addRuleToFeature(
  state: OpenTypeFeaturesState,
  feature: FeatureRecord,
  kind: CreatableRuleKind
): { state: OpenTypeFeaturesState; ruleId: string } {
  const shape = RULE_SHAPES[kind]
  const ruleId = uniqueId(`rule_${feature.tag}_manual`, collectRuleIds(state))
  const rule = shape.makeBlankRule(ruleId)

  const featureLookupIds = new Set(
    feature.entries.flatMap((entry) => entry.lookupIds)
  )
  const target = [...state.lookups]
    .reverse()
    .find(
      (lookup) =>
        featureLookupIds.has(lookup.id) &&
        lookup.editable &&
        lookup.table === shape.table &&
        lookup.lookupType === shape.lookupType
    )

  if (target) {
    return {
      ruleId,
      state: {
        ...state,
        lookups: state.lookups.map((lookup) =>
          lookup.id === target.id
            ? { ...lookup, rules: [...lookup.rules, rule] }
            : lookup
        ),
      },
    }
  }

  const lookupId = uniqueId(
    `lookup_${feature.tag}_manual`,
    new Set(state.lookups.map((lookup) => lookup.id))
  )
  const lookup: LookupRecord = {
    id: lookupId,
    name: lookupId,
    table: shape.table,
    lookupType: shape.lookupType,
    lookupFlag: {},
    rules: [rule],
    editable: true,
    origin: 'manual',
  }
  return {
    ruleId,
    state: {
      ...state,
      lookups: [...state.lookups, lookup],
      features: state.features.map((candidate) =>
        candidate.id === feature.id
          ? {
              ...candidate,
              entries: candidate.entries.map((entry) => ({
                ...entry,
                lookupIds: [...entry.lookupIds, lookupId],
              })),
            }
          : candidate
      ),
    },
  }
}

export function deleteLookupRule(
  state: OpenTypeFeaturesState,
  lookupId: string,
  ruleId: string
): OpenTypeFeaturesState {
  return {
    ...state,
    lookups: state.lookups.map((lookup) =>
      lookup.id === lookupId
        ? {
            ...lookup,
            origin: lookup.origin === 'unsupported' ? lookup.origin : 'manual',
            rules: lookup.rules.filter((rule) => rule.id !== ruleId),
          }
        : lookup
    ),
  }
}

// Creates an empty manual feature for the tag (one DFLT/dflt entry, following
// the languagesystems the state declares would over-promise: per-script
// entries are added when the user actually needs them). Returns the existing
// feature when the tag is already present.
export function createFeature(
  state: OpenTypeFeaturesState,
  tag: string
): { state: OpenTypeFeaturesState; featureId: string } | null {
  if (!VALID_FEATURE_TAG.test(tag)) {
    return null
  }
  const existing = state.features.find((feature) => feature.tag === tag)
  if (existing) {
    return { state, featureId: existing.id }
  }
  const featureId = uniqueId(
    `feature_${tag}`,
    new Set(state.features.map((feature) => feature.id))
  )
  return {
    featureId,
    state: {
      ...state,
      features: [
        ...state.features,
        {
          id: featureId,
          tag,
          isActive: true,
          origin: 'manual',
          entries: [
            {
              id: `${featureId}_entry_1`,
              script: 'DFLT',
              language: 'dflt',
              lookupIds: [],
            },
          ],
        },
      ],
    },
  }
}
