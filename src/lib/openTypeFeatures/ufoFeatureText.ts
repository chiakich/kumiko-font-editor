import { classifyRawFeatureTextSource } from '@/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from '@/lib/openTypeFeatures/defaults'
import { generateFea } from '@/lib/openTypeFeatures/generateFea'
import { hasManagedFeatureEdits } from '@/lib/openTypeFeatures/exportPolicy'
import {
  readRawFeatureVerbatimText,
  setRawFeatureTextSource,
} from '@/lib/openTypeFeatures/featureSourceSections'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures/types'
import type { FontData } from '@/domain'

export const hasExportableFeatureText = (
  state: OpenTypeFeaturesState | null | undefined
) => Boolean(state && hasManagedFeatureEdits(state))

// Whether the recorded source text still describes everything the project
// holds. Decided by re-deriving rather than by tracking edits: classify the text
// again and compare the two models through the one canonical projection there
// is. Any difference at all — a lookup added in the editor, a value changed
// inside an imported one — makes the projections differ and the answer false, so
// this cannot go stale the way an edited flag can.
const sourceTextStillDescribes = (
  state: OpenTypeFeaturesState,
  text: string
) => {
  try {
    const reclassified = classifyRawFeatureTextSource(
      setRawFeatureTextSource(createEmptyOpenTypeFeaturesState(), text)
    )
    return generateFea(reclassified).text === generateFea(state).text
  } catch {
    return false
  }
}

export const selectUfoFeatureText = (fontData: FontData): string | null => {
  const openTypeFeatures = fontData.openTypeFeatures
  if (!hasExportableFeatureText(openTypeFeatures) || !openTypeFeatures) {
    return null
  }

  // A features.fea that came in with the source and has not been edited since is
  // still the best thing to write back. Generating one instead replaced a
  // hand-written file — comments, grouping and all — on every commit, for a
  // change as unrelated as renaming the family.
  const sourceText = readRawFeatureVerbatimText(openTypeFeatures)
  if (
    sourceText !== undefined &&
    sourceTextStillDescribes(openTypeFeatures, sourceText)
  ) {
    return sourceText
  }

  return generateFea(openTypeFeatures).text
}
