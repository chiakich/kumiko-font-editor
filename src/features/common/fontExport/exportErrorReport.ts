import type { FeatureDiagnostic } from '@/lib/openTypeFeatures'
import type { FontExportFormat } from '@/features/common/fontExport/ExportFontModal'

export interface FontExportErrorReport {
  id: string
  message: string
  formats: FontExportFormat[]
  rawCompilerOutput?: string
  diagnostics: FeatureDiagnostic[]
  stack?: string
}

const hasRawCompilerOutput = (
  error: Error
): error is Error & { rawCompilerOutput: string } =>
  'rawCompilerOutput' in error && typeof error.rawCompilerOutput === 'string'

const hasDiagnostics = (
  error: Error
): error is Error & { diagnostics: FeatureDiagnostic[] } =>
  'diagnostics' in error &&
  Array.isArray(error.diagnostics) &&
  error.diagnostics.every(
    (diagnostic) =>
      diagnostic &&
      typeof diagnostic === 'object' &&
      'message' in diagnostic &&
      typeof diagnostic.message === 'string'
  )

const createReportId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `export-error-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`

export const createFontExportErrorReport = (
  error: unknown,
  formats: FontExportFormat[]
): FontExportErrorReport => {
  if (error instanceof Error) {
    return {
      id: createReportId(),
      message: error.message || '目前無法匯出字型。',
      formats,
      rawCompilerOutput: hasRawCompilerOutput(error)
        ? error.rawCompilerOutput
        : undefined,
      diagnostics: hasDiagnostics(error) ? error.diagnostics : [],
      stack: error.stack,
    }
  }

  return {
    id: createReportId(),
    message: typeof error === 'string' ? error : '目前無法匯出字型。',
    formats,
    diagnostics: [],
  }
}

export const formatFontExportErrorReport = (report: FontExportErrorReport) => {
  const lines = [
    'Font export failed',
    `Formats: ${report.formats.join(', ') || '(none)'}`,
    `Message: ${report.message}`,
  ]

  if (report.diagnostics.length > 0) {
    lines.push(
      '',
      'Diagnostics:',
      ...report.diagnostics.map(
        (diagnostic) => `[${diagnostic.severity}] ${diagnostic.message}`
      )
    )
  }

  if (report.rawCompilerOutput) {
    lines.push('', 'Raw compiler output:', report.rawCompilerOutput)
  }

  if (report.stack) {
    lines.push('', 'Stack:', report.stack)
  }

  return lines.join('\n')
}
