import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures/types'

export interface OpenTypeImportExportSummary {
  importedFeatures: number
  importedLookups: number
  importedRules: number
  manualFeatures: number
  manualLookups: number
  manualRules: number
  generatedLookups: number
  generatedRules: number
  unsupportedLookups: number
  editableLookups: number
  preservedLookups: number
  overrideLookups: number
  sourceSections: number
  rawFeatureSourceSections: number
  compiledSourceSections: number
  classifiedSourceSections: number
  sourceRecordRefs: number
  exportModeLabel: string
  exportModeDescription: string
}

export function deriveOpenTypeImportExportSummary(
  state: OpenTypeFeaturesState
): OpenTypeImportExportSummary {
  const importedFeatures = state.features.filter(
    (feature) => feature.origin === 'imported'
  ).length
  const manualFeatures = state.features.filter(
    (feature) => feature.origin === 'manual' || feature.origin === 'mixed'
  ).length
  const importedLookups = state.lookups.filter(
    (lookup) => lookup.origin === 'imported'
  ).length
  const manualLookups = state.lookups.filter(
    (lookup) => lookup.origin === 'manual'
  ).length
  const generatedLookups = state.lookups.filter(
    (lookup) => lookup.origin === 'auto' || lookup.origin === 'generated'
  ).length
  const importedRules = state.lookups.flatMap((lookup) =>
    lookup.rules.filter((rule) => rule.meta.origin === 'imported')
  ).length
  const manualRules = state.lookups.flatMap((lookup) =>
    lookup.rules.filter(
      (rule) => rule.meta.origin === 'manual' || rule.meta.origin === 'mixed'
    )
  ).length
  const generatedRules = state.lookups.flatMap((lookup) =>
    lookup.rules.filter(
      (rule) => rule.meta.origin === 'auto' || rule.meta.origin === 'synthetic'
    )
  ).length
  const sourceSections = state.sourceSections ?? []

  return {
    importedFeatures,
    importedLookups,
    importedRules,
    manualFeatures,
    manualLookups,
    manualRules,
    generatedLookups,
    generatedRules,
    unsupportedLookups: state.unsupportedLookups.length,
    editableLookups: state.lookups.filter((lookup) => lookup.editable).length,
    preservedLookups: state.lookups.filter((lookup) => !lookup.editable).length,
    overrideLookups: state.lookups.filter(
      (lookup) =>
        lookup.origin === 'manual' &&
        lookup.rules.some((rule) => rule.meta.userOverridden)
    ).length,
    sourceSections: sourceSections.length,
    rawFeatureSourceSections: sourceSections.filter(
      (section) => section.format === 'fea' && section.status === 'raw'
    ).length,
    compiledSourceSections: sourceSections.filter(
      (section) => section.kind === 'compiled-table'
    ).length,
    classifiedSourceSections: sourceSections.filter(
      (section) =>
        section.status === 'classified' ||
        section.status === 'partially-classified'
    ).length,
    sourceRecordRefs: sourceSections.flatMap((section) => section.recordRefs)
      .length,
    ...describeExportMode(state.exportPolicy),
  }
}

function describeExportMode(
  exportPolicy: OpenTypeFeaturesState['exportPolicy']
) {
  switch (exportPolicy) {
    case 'preserve-compiled-layout-tables':
      return {
        exportModeLabel: 'Preserve',
        exportModeDescription:
          'Keep imported compiled layout tables. Kumiko behavior edits are not compiled into binary export in this mode.',
      }
    case 'drop-unsupported-and-rebuild':
      return {
        exportModeLabel: 'Drop unsupported + rebuild',
        exportModeDescription:
          'Compile the managed feature model and intentionally omit unsupported imported lookups.',
      }
    case 'rebuild-managed-layout-tables':
    default:
      return {
        exportModeLabel: 'Rebuild managed',
        exportModeDescription:
          'Compile editable Kumiko OpenType behaviors into managed layout tables.',
      }
  }
}
