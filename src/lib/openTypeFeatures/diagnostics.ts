import type {
  FeatureDiagnostic,
  FeatureDiagnostic as Diagnostic,
} from '@/lib/openTypeFeatures/types'

type DiagnosticTarget = FeatureDiagnostic['target']

export const makeDiagnostic = (
  severity: Diagnostic['severity'],
  message: string,
  target: DiagnosticTarget,
  idParts: string[]
): Diagnostic => ({
  id: ['feature-diagnostic', severity, ...idParts].join('-'),
  severity,
  message,
  target,
})

export const mergeFeatureDiagnostics = (
  ...diagnosticLists: Array<FeatureDiagnostic[] | undefined>
): FeatureDiagnostic[] => {
  const diagnosticsById = new Map<string, FeatureDiagnostic>()

  for (const diagnostic of diagnosticLists.flatMap((list) => list ?? [])) {
    diagnosticsById.set(diagnostic.id, diagnostic)
  }

  return Array.from(diagnosticsById.values())
}
