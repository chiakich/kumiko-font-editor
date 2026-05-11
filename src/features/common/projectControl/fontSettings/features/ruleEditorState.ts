import type {
  FeatureOrigin,
  FeatureRecord,
  LookupOrigin,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures'

export function updateLookupRule(
  state: OpenTypeFeaturesState,
  lookupId: string,
  nextRule: Rule
): OpenTypeFeaturesState {
  const editedRule = markRuleAsUserEdited(nextRule)

  return {
    ...state,
    features: state.features.map((feature) =>
      featureReferencesLookup(feature, lookupId)
        ? markFeatureAsUserEdited(feature)
        : feature
    ),
    lookups: state.lookups.map((lookup) =>
      lookup.id === lookupId
        ? {
            ...lookup,
            origin: markLookupOriginAsUserEdited(lookup.origin),
            rules: lookup.rules.map((rule) =>
              rule.id === editedRule.id ? editedRule : rule
            ),
          }
        : lookup
    ),
  }
}

function markRuleAsUserEdited(rule: Rule): Rule {
  return {
    ...rule,
    meta: {
      ...rule.meta,
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}

function featureReferencesLookup(feature: FeatureRecord, lookupId: string) {
  return feature.entries.some((entry) => entry.lookupIds.includes(lookupId))
}

function markFeatureAsUserEdited(feature: FeatureRecord): FeatureRecord {
  return {
    ...feature,
    origin: getEditedFeatureOrigin(feature.origin),
  }
}

function getEditedFeatureOrigin(origin: FeatureOrigin): FeatureOrigin {
  return origin === 'manual' || origin === 'mixed' ? origin : 'mixed'
}

function markLookupOriginAsUserEdited(origin: LookupOrigin): LookupOrigin {
  return origin === 'unsupported' ? origin : 'manual'
}
