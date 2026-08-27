import type {
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { listPreviewFeatureToggles } from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewModel'
import { isFeatureTagEnabled } from 'src/features/common/projectControl/fontSettings/features/utils/featureEnablement'

export interface WorkspaceFeatureRow {
  tag: string
  enabled: boolean
  // First IR feature carrying the tag; null when the tag only lives in raw
  // text (then there is nothing structured to open).
  featureId: string | null
  origins: string[]
  ruleCount: number
  diagnosticsCount: number
}

// One row per feature tag, whichever authority the tag lives in.
export const listWorkspaceFeatures = (
  state: OpenTypeFeaturesState,
  diagnostics: readonly FeatureDiagnostic[]
): WorkspaceFeatureRow[] => {
  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  return listPreviewFeatureToggles(state).map(({ tag }) => {
    const features = state.features.filter((feature) => feature.tag === tag)
    const featureIds = new Set(features.map((feature) => feature.id))
    const lookupIds = new Set(
      features.flatMap((feature) =>
        feature.entries.flatMap((entry) => entry.lookupIds)
      )
    )
    const ruleCount = [...lookupIds].reduce(
      (sum, lookupId) => sum + (lookupById.get(lookupId)?.rules.length ?? 0),
      0
    )
    const origins = [...new Set(features.map((feature) => feature.origin))]
    return {
      tag,
      enabled: isFeatureTagEnabled(state, tag),
      featureId: features[0]?.id ?? null,
      origins: origins.length > 0 ? origins : ['raw'],
      ruleCount,
      diagnosticsCount: diagnostics.filter(
        (diagnostic) =>
          diagnostic.target.kind === 'feature' &&
          featureIds.has(diagnostic.target.featureId)
      ).length,
    }
  })
}
