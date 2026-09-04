import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

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

export const isCharacterVariantTag = (tag: string) =>
  /^cv(0[1-9]|[1-9][0-9])$/.test(tag)

// The UI label a character variant shows in application menus (the first
// featUiLabelNames entry; localized entries and other params are preserved).
export const getCharacterVariantLabel = (
  state: OpenTypeFeaturesState,
  featureId: string
) => {
  const feature = state.features.find((candidate) => candidate.id === featureId)
  return feature?.featureParams?.kind === 'characterVariant'
    ? (feature.featureParams.featUiLabelNames[0]?.text ?? '')
    : ''
}

export const setCharacterVariantLabel = (
  state: OpenTypeFeaturesState,
  featureId: string,
  text: string
): OpenTypeFeaturesState => ({
  ...state,
  features: state.features.map((feature) => {
    if (feature.id !== featureId || !isCharacterVariantTag(feature.tag)) {
      return feature
    }
    const trimmed = text.trim()
    const existing =
      feature.featureParams?.kind === 'characterVariant'
        ? feature.featureParams
        : {
            kind: 'characterVariant' as const,
            featUiLabelNames: [],
            featUiTooltipTextNames: [],
            sampleTextNames: [],
            paramUiLabelNames: [],
            characters: [],
          }
    if (!trimmed) {
      const remaining = existing.featUiLabelNames.slice(1)
      const isEmpty =
        remaining.length === 0 &&
        existing.featUiTooltipTextNames.length === 0 &&
        existing.sampleTextNames.length === 0 &&
        existing.paramUiLabelNames.length === 0 &&
        existing.characters.length === 0
      return {
        ...feature,
        featureParams: isEmpty
          ? undefined
          : { ...existing, featUiLabelNames: remaining },
      }
    }
    return {
      ...feature,
      featureParams: {
        ...existing,
        featUiLabelNames: [
          { ...existing.featUiLabelNames[0], text: trimmed },
          ...existing.featUiLabelNames.slice(1),
        ],
      },
    }
  }),
})
