import type { CompilerRuntimeStatus } from 'src/lib/openTypeFeatures/compilerTypes'
import type {
  ExportPolicy,
  FeatureDiagnostic,
  FeatureSourceSection,
  OpenTypeFeaturesState,
  UnsupportedLookup,
} from 'src/lib/openTypeFeatures/types'

export type OpenTypeExportWarningSeverity = 'info' | 'warning' | 'error'

export type OpenTypeExportWarningCode =
  | 'validation-errors'
  | 'compiler-runtime-not-configured'
  | 'unsupported-lookups'
  | 'feature-variations'
  | 'extension-wrapper-rebuild'
  | 'preserve-ignores-edits'
  | 'rebuild-replaces-tables'
  | 'drop-unsupported-requires-confirmation'

export interface OpenTypeExportWarning {
  id: string
  code: OpenTypeExportWarningCode
  severity: OpenTypeExportWarningSeverity
  title: string
  message: string
  details?: string[]
}

export type OpenTypeExportImpactStatus =
  | 'rebuild'
  | 'preserve'
  | 'raw'
  | 'drop'
  | 'review'

export interface OpenTypeExportImpactItem {
  id: string
  kind: 'source' | 'unsupportedLookup'
  title: string
  detail: string
  status: OpenTypeExportImpactStatus
  statusLabel: string
  table?: FeatureSourceSection['table']
  sourceId?: string
  unsupportedLookupId?: string
}

interface DeriveExportWarningsOptions {
  compilerRuntimeStatus?: CompilerRuntimeStatus
  diagnostics: FeatureDiagnostic[]
  hasGeneratedFeatureEdits?: boolean
}

const countErrors = (diagnostics: FeatureDiagnostic[]) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length

const hasImportedLayoutData = (state: OpenTypeFeaturesState) =>
  state.unsupportedLookups.length > 0 ||
  (state.sourceSections ?? []).some(
    (section) => section.origin === 'binary-import'
  ) ||
  state.lookups.some((lookup) => lookup.origin === 'imported') ||
  state.features.some((feature) => feature.origin === 'imported')

const hasFeatureEntry = (state: OpenTypeFeaturesState) =>
  state.features.some((feature) =>
    feature.entries.some((entry) => entry.lookupIds.length > 0)
  )

export const hasManagedFeatureEdits = (state: OpenTypeFeaturesState) =>
  hasFeatureEntry(state) ||
  state.lookups.some((lookup) => lookup.rules.length > 0) ||
  state.glyphClasses.length > 0 ||
  state.markClasses.length > 0 ||
  state.anchors.length > 0 ||
  Boolean(state.rawFeatureText?.trim())

export const hasBlockingExportWarnings = (warnings: OpenTypeExportWarning[]) =>
  warnings.some((warning) => warning.severity === 'error')

export const requiresDropUnsupportedConfirmation = (
  warnings: OpenTypeExportWarning[]
) =>
  warnings.some(
    (warning) => warning.code === 'drop-unsupported-requires-confirmation'
  )

const getManagedEdits = (
  state: OpenTypeFeaturesState,
  hasGeneratedFeatureEdits?: boolean
) => hasGeneratedFeatureEdits ?? hasManagedFeatureEdits(state)

export const needsOpenTypeFeatureCompilationForBinaryExport = (
  state: OpenTypeFeaturesState,
  options: { hasGeneratedFeatureEdits?: boolean } = {}
) =>
  state.exportPolicy !== 'preserve-compiled-layout-tables' &&
  getManagedEdits(state, options.hasGeneratedFeatureEdits)

const getValidationWarning = (
  diagnostics: FeatureDiagnostic[]
): OpenTypeExportWarning | null => {
  const errorCount = countErrors(diagnostics)
  if (errorCount === 0) {
    return null
  }

  return {
    id: 'open-type-export-validation-errors',
    code: 'validation-errors',
    severity: 'error',
    title: 'OpenType feature state has errors',
    message: `${errorCount} validation error${
      errorCount === 1 ? '' : 's'
    } must be fixed before feature compilation or export can run.`,
  }
}

const getPreservePolicyWarning = (
  policy: ExportPolicy,
  hasEdits: boolean
): OpenTypeExportWarning | null => {
  if (policy !== 'preserve-compiled-layout-tables' || !hasEdits) {
    return null
  }

  return {
    id: 'open-type-export-preserve-ignores-edits',
    code: 'preserve-ignores-edits',
    severity: 'warning',
    title: 'Feature edits will not be exported',
    message:
      'Compiled OpenType layout tables will be preserved, so current Kumiko feature edits are not included in the exported font.',
  }
}

const getCompilerRuntimeWarning = (
  state: OpenTypeFeaturesState,
  hasEdits: boolean,
  compilerRuntimeStatus?: CompilerRuntimeStatus
): OpenTypeExportWarning | null => {
  if (
    !compilerRuntimeStatus ||
    compilerRuntimeStatus.canCompile ||
    !needsOpenTypeFeatureCompilationForBinaryExport(state, {
      hasGeneratedFeatureEdits: hasEdits,
    })
  ) {
    return null
  }

  return {
    id: 'open-type-export-compiler-runtime-not-configured',
    code: 'compiler-runtime-not-configured',
    severity: 'warning',
    title: 'Feature compilation is not configured',
    message:
      'Binary font export cannot include current Kumiko OpenType feature edits until an offline feature compiler runtime is configured. Export UFO ZIP or preserve compiled tables to continue without compiling generated FEA.',
  }
}

const getRebuildPolicyWarning = (
  state: OpenTypeFeaturesState,
  hasEdits: boolean
): OpenTypeExportWarning | null => {
  if (
    state.exportPolicy !== 'rebuild-managed-layout-tables' ||
    (!hasEdits && !hasImportedLayoutData(state))
  ) {
    return null
  }

  return {
    id: 'open-type-export-rebuild-replaces-tables',
    code: 'rebuild-replaces-tables',
    severity: 'warning',
    title: 'Layout tables may be rebuilt',
    message:
      "OpenType layout tables will be rebuilt from Kumiko's feature model. Existing compiled layout data may be replaced.",
  }
}

const getUnsupportedWarning = (
  state: OpenTypeFeaturesState
): OpenTypeExportWarning | null => {
  if (
    state.unsupportedLookups.length === 0 ||
    state.exportPolicy === 'drop-unsupported-and-rebuild'
  ) {
    return null
  }

  return {
    id: 'open-type-export-unsupported-lookups',
    code: 'unsupported-lookups',
    severity: 'warning',
    title: 'Unsupported OpenType lookups exist',
    message:
      'Some imported OpenType lookups are not editable or not representable. Rebuilding layout tables may remove them.',
  }
}

const getFeatureVariationWarning = (
  state: OpenTypeFeaturesState,
  diagnostics: FeatureDiagnostic[]
): OpenTypeExportWarning | null => {
  const featureVariationDiagnostics = diagnostics.filter((diagnostic) =>
    diagnostic.id.includes('feature-variations-present')
  )
  if (
    featureVariationDiagnostics.length === 0 ||
    state.exportPolicy === 'preserve-compiled-layout-tables'
  ) {
    return null
  }

  return {
    id: 'open-type-export-feature-variations',
    code: 'feature-variations',
    severity: 'warning',
    title: 'FeatureVariations require preservation',
    message:
      'Imported FeatureVariations table data is preserved as compiled source material but is not reconstructed into editable rules. Rebuilding layout tables may omit it.',
    details: featureVariationDiagnostics.map(
      (diagnostic) => diagnostic.message
    ),
  }
}

const getExtensionWrapperLookups = (state: OpenTypeFeaturesState) =>
  state.lookups.filter(
    (lookup) =>
      lookup.editable &&
      lookup.meta?.extensionLookupUnwrappedForEditing === true
  )

const getExtensionWrapperWarning = (
  state: OpenTypeFeaturesState
): OpenTypeExportWarning | null => {
  const extensionLookups = getExtensionWrapperLookups(state)
  if (
    extensionLookups.length === 0 ||
    state.exportPolicy === 'preserve-compiled-layout-tables'
  ) {
    return null
  }

  return {
    id: 'open-type-export-extension-wrapper-rebuild',
    code: 'extension-wrapper-rebuild',
    severity: 'warning',
    title: 'Extension lookup wrappers may change',
    message:
      'Imported extension lookups were unwrapped into editable rules. Rebuilding layout tables can preserve behavior, but generated FEA does not guarantee the original ExtensionSubst/ExtensionPos wrapper shape.',
    details: extensionLookups.map(
      (lookup) =>
        `${lookup.table} lookup ${lookup.provenance?.lookupIndex ?? lookup.id}: ${lookup.lookupType}`
    ),
  }
}

const getDropUnsupportedWarning = (
  state: OpenTypeFeaturesState
): OpenTypeExportWarning | null => {
  if (
    state.exportPolicy !== 'drop-unsupported-and-rebuild' ||
    state.unsupportedLookups.length === 0
  ) {
    return null
  }

  return {
    id: 'open-type-export-drop-unsupported',
    code: 'drop-unsupported-requires-confirmation',
    severity: 'warning',
    title: 'Unsupported lookups will be dropped',
    message: `${state.unsupportedLookups.length} unsupported lookup${
      state.unsupportedLookups.length === 1 ? '' : 's'
    } will be removed when layout tables are rebuilt. This should require explicit user confirmation before compiler integration is enabled.`,
    details: state.unsupportedLookups.map(
      (lookup) =>
        `${lookup.table} lookup ${lookup.lookupIndex}: ${lookup.reason} (${lookup.rawSummary})`
    ),
  }
}

export const deriveOpenTypeExportWarnings = (
  state: OpenTypeFeaturesState,
  options: DeriveExportWarningsOptions
) => {
  const hasEdits = getManagedEdits(state, options.hasGeneratedFeatureEdits)
  return [
    getValidationWarning(options.diagnostics),
    getCompilerRuntimeWarning(state, hasEdits, options.compilerRuntimeStatus),
    getPreservePolicyWarning(state.exportPolicy, hasEdits),
    getRebuildPolicyWarning(state, hasEdits),
    getUnsupportedWarning(state),
    getExtensionWrapperWarning(state),
    getFeatureVariationWarning(state, options.diagnostics),
    getDropUnsupportedWarning(state),
  ].filter((warning): warning is OpenTypeExportWarning => Boolean(warning))
}

export const deriveOpenTypeExportImpactItems = (
  state: OpenTypeFeaturesState
): OpenTypeExportImpactItem[] => [
  ...(state.sourceSections ?? []).map((section) =>
    getSourceImpactItem(state.exportPolicy, section)
  ),
  ...state.unsupportedLookups.map((lookup) =>
    getUnsupportedLookupImpactItem(state.exportPolicy, lookup)
  ),
]

function getSourceImpactItem(
  exportPolicy: ExportPolicy,
  section: FeatureSourceSection
): OpenTypeExportImpactItem {
  const linkedRecords = section.recordRefs.length
  const extensionDetail = getExtensionWrapperImpactDetail(section)

  if (section.status === 'raw') {
    return {
      id: `export-impact-source-${section.id}`,
      kind: 'source',
      sourceId: section.id,
      table: section.table,
      title: section.title,
      detail: `Raw source remains in generated FEA. ${linkedRecords} linked records.`,
      status: 'raw',
      statusLabel: 'Raw FEA',
    }
  }

  if (
    section.kind === 'compiled-table' &&
    exportPolicy === 'preserve-compiled-layout-tables'
  ) {
    return {
      id: `export-impact-source-${section.id}`,
      kind: 'source',
      sourceId: section.id,
      table: section.table,
      title: section.title,
      detail: `Compiled source is preserved from the imported font. ${linkedRecords} linked records.`,
      status: 'preserve',
      statusLabel: 'Preserve',
    }
  }

  if (
    section.kind === 'compiled-table' &&
    section.preservationPolicy === 'preserve-if-unchanged'
  ) {
    return {
      id: `export-impact-source-${section.id}`,
      kind: 'source',
      sourceId: section.id,
      table: section.table,
      title: section.title,
      detail: `Compiled source has unsupported records and needs review before rebuild. ${linkedRecords} linked records.${extensionDetail}`,
      status: 'review',
      statusLabel: 'Review',
    }
  }

  return {
    id: `export-impact-source-${section.id}`,
    kind: 'source',
    sourceId: section.id,
    table: section.table,
    title: section.title,
    detail: `Classified source is rebuilt from the Kumiko feature model. ${linkedRecords} linked records.${extensionDetail}`,
    status: 'rebuild',
    statusLabel: 'Rebuild',
  }
}

function getExtensionWrapperImpactDetail(section: FeatureSourceSection) {
  const extensionLookupCount =
    typeof section.meta?.extensionLookupCount === 'number'
      ? section.meta.extensionLookupCount
      : 0
  if (extensionLookupCount <= 0) return ''

  return ` ${extensionLookupCount} extension lookup wrapper${
    extensionLookupCount === 1 ? '' : 's'
  } may be emitted as equivalent regular lookup rules.`
}

function getUnsupportedLookupImpactItem(
  exportPolicy: ExportPolicy,
  lookup: UnsupportedLookup
): OpenTypeExportImpactItem {
  if (exportPolicy === 'preserve-compiled-layout-tables') {
    return {
      id: `export-impact-unsupported-${lookup.id}`,
      kind: 'unsupportedLookup',
      unsupportedLookupId: lookup.id,
      table: lookup.table,
      title: `${lookup.table} lookup ${lookup.lookupIndex}`,
      detail: `Unsupported lookup is preserved with compiled layout tables. ${lookup.reason}`,
      status: 'preserve',
      statusLabel: 'Preserve',
    }
  }

  if (exportPolicy === 'drop-unsupported-and-rebuild') {
    return {
      id: `export-impact-unsupported-${lookup.id}`,
      kind: 'unsupportedLookup',
      unsupportedLookupId: lookup.id,
      table: lookup.table,
      title: `${lookup.table} lookup ${lookup.lookupIndex}`,
      detail: `Unsupported lookup is intentionally dropped on rebuild. ${lookup.reason}`,
      status: 'drop',
      statusLabel: 'Drop',
    }
  }

  return {
    id: `export-impact-unsupported-${lookup.id}`,
    kind: 'unsupportedLookup',
    unsupportedLookupId: lookup.id,
    table: lookup.table,
    title: `${lookup.table} lookup ${lookup.lookupIndex}`,
    detail: `Unsupported lookup is not rebuilt; choose preserve or explicit drop before binary export. ${lookup.reason}`,
    status: 'review',
    statusLabel: 'Review',
  }
}
