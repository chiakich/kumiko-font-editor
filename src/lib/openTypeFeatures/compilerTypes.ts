import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures/types'

export interface CompileOptions {
  affectedTables: Array<'GSUB' | 'GPOS' | 'GDEF'>
  debug?: boolean
}

export interface CompileResult {
  fontBuffer: ArrayBuffer
  diagnostics: FeatureDiagnostic[]
  rawCompilerOutput?: string
}

export interface CompileRequestMessage {
  type: 'compile-font-features'
  payload: {
    inputFontBuffer: ArrayBuffer
    generatedFea: string
    options: CompileOptions
  }
}

export interface CompileSuccessMessage {
  type: 'compile-success'
  payload: CompileResult
}

export interface CompileErrorMessage {
  type: 'compile-error'
  payload: {
    diagnostics: FeatureDiagnostic[]
    message: string
    rawCompilerOutput?: string
  }
}

export type CompileResponseMessage = CompileSuccessMessage | CompileErrorMessage
