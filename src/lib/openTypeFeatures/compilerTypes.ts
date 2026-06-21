import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures/types'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures/feaAst'

export type OpenTypeCompilerBackend =
  | 'not-configured'
  | 'pyodide-fonttools'
  | 'wasm-fonttools'

export type CompilerRuntimeState =
  | 'not-configured'
  | 'initializing'
  | 'ready'
  | 'error'

export interface CompilerRuntimeStatus {
  backend: OpenTypeCompilerBackend
  canCompile: boolean
  message: string
  state: CompilerRuntimeState
}

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
    sourceMap?: GeneratedFeaSourceMap
  }
}

export interface CompileSuccessMessage {
  type: 'compile-success'
  payload: CompileResult
}

export interface CompileErrorMessage {
  type: 'compile-error'
  payload: {
    backend: OpenTypeCompilerBackend
    diagnostics: FeatureDiagnostic[]
    message: string
    rawCompilerOutput?: string
    runtimeStatus: CompilerRuntimeStatus
  }
}

export type CompileResponseMessage = CompileSuccessMessage | CompileErrorMessage
