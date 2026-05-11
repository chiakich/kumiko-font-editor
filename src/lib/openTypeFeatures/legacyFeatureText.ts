import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures/types'
import type { FontData } from 'src/store/types'

export const hasActiveManagedFeatureText = (
  state: OpenTypeFeaturesState | null | undefined
) => Boolean(state?.features.some((feature) => feature.isActive))

const normalizeLegacyFeatureText = (text: string | null | undefined) =>
  text && text.length > 0 ? text : null

export const selectUfoFeatureText = (fontData: FontData): string | null => {
  const openTypeFeatures = fontData.openTypeFeatures
  if (hasActiveManagedFeatureText(openTypeFeatures) && openTypeFeatures) {
    return generateFea(openTypeFeatures).text
  }

  return normalizeLegacyFeatureText(fontData.features?.text)
}
