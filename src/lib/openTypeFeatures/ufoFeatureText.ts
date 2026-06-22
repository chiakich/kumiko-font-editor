import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { hasManagedFeatureEdits } from 'src/lib/openTypeFeatures/exportPolicy'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures/types'
import type { FontData } from 'src/store/types'

export const hasExportableFeatureText = (
  state: OpenTypeFeaturesState | null | undefined
) => Boolean(state && hasManagedFeatureEdits(state))

export const selectUfoFeatureText = (fontData: FontData): string | null => {
  const openTypeFeatures = fontData.openTypeFeatures
  if (hasExportableFeatureText(openTypeFeatures) && openTypeFeatures) {
    return generateFea(openTypeFeatures).text
  }

  return null
}
