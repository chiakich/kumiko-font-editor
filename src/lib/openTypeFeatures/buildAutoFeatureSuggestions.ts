import { buildLigatureSuggestions } from 'src/lib/openTypeFeatures/buildLigatureSuggestions'
import { buildLocalizedSuggestions } from 'src/lib/openTypeFeatures/buildLocalizedSuggestions'
import { buildKerningSuggestions } from 'src/lib/openTypeFeatures/buildKerningSuggestions'
import { buildMarkSuggestions } from 'src/lib/openTypeFeatures/buildMarkSuggestions'
import { buildSuffixSuggestions } from 'src/lib/openTypeFeatures/buildSuffixSuggestions'
import type {
  AutoFeatureSuggestion,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures/types'
import type { FontData } from 'src/store/types'

const suggestionTouchesUserOverride = (
  suggestion: AutoFeatureSuggestion,
  state: OpenTypeFeaturesState
) => {
  const suggestedRuleIds = new Set(suggestion.ruleIds)
  return state.lookups.some((lookup) =>
    lookup.rules.some(
      (rule) => suggestedRuleIds.has(rule.id) && rule.meta.userOverridden
    )
  )
}

export const buildAutoFeatureSuggestions = (
  fontData: FontData,
  state: OpenTypeFeaturesState
): AutoFeatureSuggestion[] => {
  if (!state.autoFeatureConfig.enabled) return []
  const ignoredIds = new Set(state.ignoredSuggestionIds)
  return [
    ...buildLigatureSuggestions(fontData, state),
    ...buildSuffixSuggestions(fontData, state),
    ...buildLocalizedSuggestions(fontData, state),
    ...buildKerningSuggestions(fontData, state),
    ...buildMarkSuggestions(fontData, state),
  ].filter(
    (suggestion) =>
      !ignoredIds.has(suggestion.id) &&
      !suggestionTouchesUserOverride(suggestion, state) &&
      suggestion.lookup.rules.length > 0
  )
}
