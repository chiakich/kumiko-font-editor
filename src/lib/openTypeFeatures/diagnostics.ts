import type {
  FeatureDiagnostic,
  FeatureDiagnostic as Diagnostic,
} from 'src/lib/openTypeFeatures/types'

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
