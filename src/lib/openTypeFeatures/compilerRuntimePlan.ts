import { makeDiagnostic } from 'src/lib/openTypeFeatures/diagnostics'
import { mapCompilerErrorsToDiagnostics } from 'src/lib/openTypeFeatures/compilerErrorMapping'
import type {
  CompileErrorMessage,
  CompilerRuntimeStatus,
  OpenTypeCompilerBackend,
} from 'src/lib/openTypeFeatures/compilerTypes'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures/feaAst'

export const AVAILABLE_OPEN_TYPE_COMPILER_BACKENDS: OpenTypeCompilerBackend[] =
  ['not-configured', 'pyodide-fonttools', 'wasm-fonttools']

export const DEFAULT_OPEN_TYPE_COMPILER_BACKEND: OpenTypeCompilerBackend =
  'not-configured'

const RUNTIME_NOT_CONFIGURED_MESSAGE =
  'OpenType feature compilation is not configured yet. Generated FEA can be inspected, but binary layout compilation needs an offline WASM font compiler runtime.'

export const createCompilerRuntimeStatus = (
  backend: OpenTypeCompilerBackend = DEFAULT_OPEN_TYPE_COMPILER_BACKEND
): CompilerRuntimeStatus => {
  if (backend === 'not-configured') {
    return {
      backend,
      canCompile: false,
      message: RUNTIME_NOT_CONFIGURED_MESSAGE,
      state: 'not-configured',
    }
  }

  return {
    backend,
    canCompile: false,
    message:
      'OpenType feature compiler backend is declared but no runtime loader has been wired yet.',
    state: 'error',
  }
}

export const makeRuntimeNotConfiguredDiagnostic = () =>
  makeDiagnostic('error', RUNTIME_NOT_CONFIGURED_MESSAGE, { kind: 'global' }, [
    'compiler-runtime',
    'not-configured',
  ])

export const makeCompilerErrorResponse = ({
  backend,
  message,
  rawCompilerOutput,
  runtimeStatus,
  sourceMap,
}: {
  backend: OpenTypeCompilerBackend
  message: string
  rawCompilerOutput?: string
  runtimeStatus: CompilerRuntimeStatus
  sourceMap?: GeneratedFeaSourceMap
}): CompileErrorMessage => ({
  type: 'compile-error',
  payload: {
    backend,
    diagnostics: mapCompilerErrorsToDiagnostics({
      fallbackMessage: message,
      rawCompilerOutput,
      sourceMap,
    }),
    message,
    rawCompilerOutput,
    runtimeStatus,
  },
})

export const makeRuntimeNotConfiguredResponse = (): CompileErrorMessage => {
  const runtimeStatus = createCompilerRuntimeStatus()

  return {
    type: 'compile-error',
    payload: {
      backend: runtimeStatus.backend,
      diagnostics: [makeRuntimeNotConfiguredDiagnostic()],
      message: runtimeStatus.message,
      runtimeStatus,
    },
  }
}
