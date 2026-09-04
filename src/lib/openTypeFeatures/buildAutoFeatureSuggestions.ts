import { buildLigatureSuggestions } from '@/lib/openTypeFeatures/buildLigatureSuggestions'
import { buildLocalizedSuggestions } from '@/lib/openTypeFeatures/buildLocalizedSuggestions'
import { buildMarkSuggestions } from '@/lib/openTypeFeatures/buildMarkSuggestions'
import { buildSuffixSuggestions } from '@/lib/openTypeFeatures/buildSuffixSuggestions'
import type {
  AutoFeatureSuggestion,
  OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures/types'
import type { FontData } from '@/store/types'

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
    // Kerning no longer needs a suggestion: project kerning data is
    // synthesized into the kern feature at every compile (synthesizeKerning).
    ...buildMarkSuggestions(fontData, state),
  ].filter(
    (suggestion) =>
      !ignoredIds.has(suggestion.id) &&
      !suggestionTouchesUserOverride(suggestion, state) &&
      suggestion.lookup.rules.length > 0
  )
}
