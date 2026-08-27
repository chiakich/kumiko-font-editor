import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

// Whether a feature tag is enabled for export: the IR feature must be active
// AND its raw snippet (when one carries the same tag) not disabled. The two
// authorities are toggled together so the generated FEA and the raw track
// never disagree about what ships.
export const isFeatureTagEnabled = (
  state: OpenTypeFeaturesState,
  tag: string
) => {
  const features = state.features.filter((feature) => feature.tag === tag)
  if (features.length > 0 && features.every((feature) => !feature.isActive)) {
    return false
  }
  const snippets = (state.rawFeatureSnippets ?? []).filter(
    (snippet) => snippet.kind === 'feature' && snippet.tag === tag
  )
  if (
    features.length === 0 &&
    snippets.length > 0 &&
    snippets.every((snippet) => snippet.disabled)
  ) {
    return false
  }
  return true
}

export const setFeatureTagEnabled = (
  state: OpenTypeFeaturesState,
  tag: string,
  enabled: boolean
): OpenTypeFeaturesState => ({
  ...state,
  features: state.features.map((feature) =>
    feature.tag === tag ? { ...feature, isActive: enabled } : feature
  ),
  rawFeatureSnippets: state.rawFeatureSnippets?.map((snippet) =>
    snippet.kind === 'feature' && snippet.tag === tag
      ? { ...snippet, disabled: !enabled }
      : snippet
  ),
})
