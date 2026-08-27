import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

export const isStylisticSetTag = (tag: string) =>
  /^ss(0[1-9]|1\d|20)$/.test(tag)

// The display name a stylistic set shows in application menus (the first
// featureNames entry; further localized entries are kept untouched).
export const getStylisticSetName = (
  state: OpenTypeFeaturesState,
  featureId: string
) => {
  const feature = state.features.find((candidate) => candidate.id === featureId)
  return feature?.featureParams?.kind === 'stylisticSet'
    ? (feature.featureParams.names[0]?.text ?? '')
    : ''
}

export const setStylisticSetName = (
  state: OpenTypeFeaturesState,
  featureId: string,
  text: string
): OpenTypeFeaturesState => ({
  ...state,
  features: state.features.map((feature) => {
    if (feature.id !== featureId || !isStylisticSetTag(feature.tag)) {
      return feature
    }
    const trimmed = text.trim()
    const existing =
      feature.featureParams?.kind === 'stylisticSet'
        ? feature.featureParams.names
        : []
    if (!trimmed) {
      // An emptied name drops the whole params block only when nothing
      // localized remains to preserve.
      if (existing.length <= 1) {
        return { ...feature, featureParams: undefined }
      }
      return {
        ...feature,
        featureParams: { kind: 'stylisticSet', names: existing.slice(1) },
      }
    }
    return {
      ...feature,
      featureParams: {
        kind: 'stylisticSet',
        names: [{ ...existing[0], text: trimmed }, ...existing.slice(1)],
      },
    }
  }),
})
