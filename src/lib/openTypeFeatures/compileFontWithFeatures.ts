import type {
  CompileResponseMessage,
  CompileOptions,
  CompileResult,
} from 'src/lib/openTypeFeatures/compilerTypes'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures/feaAst'
import { createWorkerRpcClient } from 'src/lib/workers/createWorkerRpcClient'

// The worker stays alive between compiles: loading Pyodide + fontTools inside
// it dominates a compile by far, and the runtime cache lives in the worker's
// module scope, so terminating the worker would throw that work away.
const client = createWorkerRpcClient<CompileResponseMessage>({
  createWorker: () =>
    new Worker(
      new URL(
        '../../workers/openTypeFeatureCompilerWorker.ts',
        import.meta.url
      ),
      { type: 'module' }
    ),
  getRequestId: (response) => response.requestId,
  toOutcome: (response) => {
    if (response.type === 'compile-success') {
      return { status: 'success', value: response.payload }
    }
    const error = new Error(response.payload.message)
    Object.assign(error, {
      diagnostics: response.payload.diagnostics,
      rawCompilerOutput: response.payload.rawCompilerOutput,
    })
    return { status: 'error', error }
  },
  workerErrorMessage: 'OpenType feature compiler failed',
})

export const compileFontWithFeatures = (
  inputFontBuffer: ArrayBuffer,
  generatedFea: string,
  options: CompileOptions,
  sourceMap?: GeneratedFeaSourceMap
): Promise<CompileResult> =>
  client.request<CompileResult>(
    (requestId) => ({
      type: 'compile-font-features',
      requestId,
      payload: {
        inputFontBuffer,
        generatedFea,
        options,
        sourceMap,
      },
    }),
    { transfer: [inputFontBuffer] }
  )

// Warm the compiler ahead of the first real compile (e.g. when the feature
// workspace opens) so the first preview doesn't pay the Pyodide load.
export const prewarmOpenTypeFeatureCompiler = () => {
  client.post({ type: 'prewarm-compiler-runtime' })
}
