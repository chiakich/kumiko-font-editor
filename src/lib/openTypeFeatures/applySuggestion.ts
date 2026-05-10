import { createFeatureRecordForSuggestion } from 'src/lib/openTypeFeatures/autoFeatureLookup'
import type {
  AutoFeatureSuggestion,
  FeatureEntry,
  GlyphClass,
  MarkClass,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures/types'

const getLocalizedEntries = (
  suggestion: AutoFeatureSuggestion
): FeatureEntry[] | null => {
  const entries = suggestion.lookup.meta?.languageEntries
  return Array.isArray(entries) ? (entries as FeatureEntry[]) : null
}

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => {
  const existingIds = new Set(existing.map((item) => item.id))
  return [...existing, ...incoming.filter((item) => !existingIds.has(item.id))]
}

export const applyAutoFeatureSuggestion = (
  state: OpenTypeFeaturesState,
  suggestion: AutoFeatureSuggestion
): OpenTypeFeaturesState => {
  const existingFeature = state.features.find(
    (feature) => feature.tag === suggestion.featureTag
  )
  const lookupIds = new Set(state.lookups.map((lookup) => lookup.id))
  const nextLookup = lookupIds.has(suggestion.lookup.id)
    ? state.lookups
    : [...state.lookups, suggestion.lookup]

  const nextFeatures = existingFeature
    ? state.features.map((feature) =>
        feature.id === existingFeature.id
          ? {
              ...feature,
              origin: feature.origin === 'manual' ? 'mixed' : feature.origin,
              entries: [
                ...feature.entries,
                ...(getLocalizedEntries(suggestion) ?? [
                  {
                    id: `entry_${suggestion.featureTag}_${suggestion.lookup.id}`,
                    script: 'DFLT',
                    language: 'dflt',
                    lookupIds: [suggestion.lookup.id],
                  },
                ]),
              ],
            }
          : feature
      )
    : [
        ...state.features,
        {
          ...createFeatureRecordForSuggestion(
            suggestion.featureTag,
            suggestion.lookup.id
          ),
          entries:
            getLocalizedEntries(suggestion) ??
            createFeatureRecordForSuggestion(
              suggestion.featureTag,
              suggestion.lookup.id
            ).entries,
        },
      ]

  return {
    ...state,
    features: nextFeatures,
    lookups: nextLookup,
    glyphClasses: mergeById<GlyphClass>(
      state.glyphClasses,
      suggestion.glyphClasses ?? []
    ),
    markClasses: mergeById<MarkClass>(
      state.markClasses,
      suggestion.markClasses ?? []
    ),
  }
}

export const ignoreAutoFeatureSuggestion = (
  state: OpenTypeFeaturesState,
  suggestion: AutoFeatureSuggestion
): OpenTypeFeaturesState => ({
  ...state,
  ignoredSuggestionIds: Array.from(
    new Set([...state.ignoredSuggestionIds, suggestion.id])
  ),
})
