import type {
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'
import { listPreviewFeatureToggles } from '@/features/common/openTypeFeatures/utils/shapingPreviewModel'
import { isFeatureTagEnabled } from '@/features/common/openTypeFeatures/utils/featureEnablement'

export interface WorkspaceFeatureRow {
  tag: string
  enabled: boolean
  // First IR feature carrying the tag; null when the tag only lives in raw
  // text (then there is nothing structured to open).
  featureId: string | null
  origins: string[]
  ruleCount: number
  diagnosticsCount: number
  // The kern feature synthesized from project kerning data — it opens the
  // pair workbench rather than a feature document.
  isProjectKerning?: boolean
}

// One row per feature tag, whichever authority the tag lives in. Project
// kerning appears as a kern row even with no IR kern feature: the compiled
// binary really carries it.
export const listWorkspaceFeatures = (
  state: OpenTypeFeaturesState,
  diagnostics: readonly FeatureDiagnostic[],
  options: {
    projectKerningPairCount?: number
    projectVerticalKerningPairCount?: number
  } = {}
): WorkspaceFeatureRow[] => {
  const projectPairCount = options.projectKerningPairCount ?? 0
  const projectVerticalPairCount = options.projectVerticalKerningPairCount ?? 0
  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  const rows = listPreviewFeatureToggles(state, 'ltr', [
    ...(projectPairCount > 0 ? ['kern'] : []),
    ...(projectVerticalPairCount > 0 ? ['vkrn'] : []),
  ]).map(({ tag }) => {
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
    const projectCount =
      tag === 'kern'
        ? projectPairCount
        : tag === 'vkrn'
          ? projectVerticalPairCount
          : 0
    const isProjectKerning = projectCount > 0
    return {
      tag,
      enabled: isProjectKerning || isFeatureTagEnabled(state, tag),
      featureId: features[0]?.id ?? null,
      origins:
        origins.length > 0 ? origins : isProjectKerning ? ['project'] : ['raw'],
      ruleCount: ruleCount + projectCount,
      diagnosticsCount: diagnostics.filter(
        (diagnostic) =>
          diagnostic.target.kind === 'feature' &&
          featureIds.has(diagnostic.target.featureId)
      ).length,
      ...(isProjectKerning ? { isProjectKerning } : {}),
    }
  })
  return rows
}
