import type {
  ExportPolicy,
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures/types'

export type OpenTypeExportWarningSeverity = 'info' | 'warning' | 'error'

export type OpenTypeExportWarningCode =
  | 'validation-errors'
  | 'unsupported-lookups'
  | 'preserve-ignores-edits'
  | 'rebuild-replaces-tables'
  | 'drop-unsupported-requires-confirmation'

export interface OpenTypeExportWarning {
  id: string
  code: OpenTypeExportWarningCode
  severity: OpenTypeExportWarningSeverity
  title: string
  message: string
}

interface DeriveExportWarningsOptions {
  diagnostics: FeatureDiagnostic[]
  hasGeneratedFeatureEdits?: boolean
}

const countErrors = (diagnostics: FeatureDiagnostic[]) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length

const hasImportedLayoutData = (state: OpenTypeFeaturesState) =>
  state.unsupportedLookups.length > 0 ||
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
  Boolean(state.rawPrelude?.trim())

export const hasBlockingExportWarnings = (warnings: OpenTypeExportWarning[]) =>
  warnings.some((warning) => warning.severity === 'error')

const getManagedEdits = (
  state: OpenTypeFeaturesState,
  hasGeneratedFeatureEdits?: boolean
) => hasGeneratedFeatureEdits ?? hasManagedFeatureEdits(state)

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
  }
}

export const deriveOpenTypeExportWarnings = (
  state: OpenTypeFeaturesState,
  options: DeriveExportWarningsOptions
) => {
  const hasEdits = getManagedEdits(state, options.hasGeneratedFeatureEdits)
  return [
    getValidationWarning(options.diagnostics),
    getPreservePolicyWarning(state.exportPolicy, hasEdits),
    getRebuildPolicyWarning(state, hasEdits),
    getUnsupportedWarning(state),
    getDropUnsupportedWarning(state),
  ].filter((warning): warning is OpenTypeExportWarning => Boolean(warning))
}
