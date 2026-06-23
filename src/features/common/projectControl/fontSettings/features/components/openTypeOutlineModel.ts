import type {
  FeatureDiagnostic,
  FeatureRecord,
  OpenTypeFeaturesState,
  OpenTypeTableTag,
} from 'src/lib/openTypeFeatures'
import type { OpenTypeWorkbenchSelection } from 'src/features/common/projectControl/fontSettings/features/components/openTypeWorkbenchSelection'

export function isSourceSelected(
  selected: OpenTypeWorkbenchSelection,
  view: Extract<OpenTypeWorkbenchSelection, { kind: 'source' }>['view']
) {
  return selected.kind === 'source' && selected.view === view
}

export function isPrefixSelected(
  selected: OpenTypeWorkbenchSelection,
  view: Extract<OpenTypeWorkbenchSelection, { kind: 'prefix' }>['view']
) {
  return selected.kind === 'prefix' && selected.view === view
}

export function isBuildSelected(
  selected: OpenTypeWorkbenchSelection,
  view: Extract<OpenTypeWorkbenchSelection, { kind: 'build' }>['view']
) {
  return selected.kind === 'build' && selected.view === view
}

export function diagnosticsForFeature(
  diagnostics: FeatureDiagnostic[],
  featureId: string
) {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.target.kind === 'feature' &&
      diagnostic.target.featureId === featureId
  ).length
}

export function diagnosticsForWorkflow(diagnostics: FeatureDiagnostic[]) {
  return diagnostics.filter((diagnostic) => diagnostic.target.kind === 'global')
    .length
}

export function getFeatureDetail(feature: FeatureRecord) {
  const lookupCount = new Set(
    feature.entries.flatMap((entry) => entry.lookupIds)
  ).size

  return `${feature.entries.length} entries / ${lookupCount} lookups`
}

export function getFeatureTable(feature: FeatureRecord) {
  const table = feature.meta?.table
  return typeof table === 'string' ? table : undefined
}

export function getLayoutTableSummaries(state: OpenTypeFeaturesState) {
  const tables: OpenTypeTableTag[] = ['GSUB', 'GPOS', 'GDEF']
  const sourceSections = state.sourceSections ?? []

  return tables
    .map((table) => {
      const featureCount = state.features.filter(
        (feature) => feature.meta?.table === table
      ).length
      const lookupCount = state.lookups.filter(
        (lookup) => lookup.table === table
      ).length
      const sourceCount = sourceSections.filter(
        (sourceSection) => sourceSection.table === table
      ).length
      const unsupportedCount = state.unsupportedLookups.filter(
        (lookup) => lookup.table === table
      ).length

      return {
        featureCount,
        lookupCount,
        sourceCount,
        table,
        unsupportedCount,
      }
    })
    .filter(
      (summary) =>
        summary.featureCount > 0 ||
        summary.lookupCount > 0 ||
        summary.sourceCount > 0 ||
        summary.unsupportedCount > 0
    )
}
