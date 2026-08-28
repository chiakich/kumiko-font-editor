import type {
  CompileResponseMessage,
  CompileOptions,
  CompileResult,
} from 'src/lib/openTypeFeatures/compilerTypes'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures/feaAst'

interface PendingCompile {
  resolve: (result: CompileResult) => void
  reject: (error: Error) => void
}

// The worker stays alive between compiles: loading Pyodide + fontTools inside
// it dominates a compile by far, and the runtime cache lives in the worker's
// module scope, so terminating the worker would throw that work away.
let compilerWorker: Worker | null = null
let nextRequestId = 1
const pendingCompiles = new Map<number, PendingCompile>()

const failAllPending = (error: Error) => {
  const entries = [...pendingCompiles.values()]
  pendingCompiles.clear()
  for (const entry of entries) {
    entry.reject(error)
  }
}

const resetCompilerWorker = (error: Error) => {
  compilerWorker?.terminate()
  compilerWorker = null
  failAllPending(error)
}

const getCompilerWorker = () => {
  if (compilerWorker) {
    return compilerWorker
  }
  const worker = new Worker(
    new URL('../../workers/openTypeFeatureCompilerWorker.ts', import.meta.url),
    { type: 'module' }
  )
  worker.onmessage = (event: MessageEvent<CompileResponseMessage>) => {
    const { requestId } = event.data
    const pending =
      requestId === undefined ? undefined : pendingCompiles.get(requestId)
    if (!pending) {
      return
    }
    pendingCompiles.delete(requestId as number)
    if (event.data.type === 'compile-success') {
      pending.resolve(event.data.payload)
      return
    }
    const error = new Error(event.data.payload.message)
    Object.assign(error, {
      diagnostics: event.data.payload.diagnostics,
      rawCompilerOutput: event.data.payload.rawCompilerOutput,
    })
    pending.reject(error)
  }
  // A worker-level error means the runtime itself is broken, not one compile:
  // fail everything in flight and start fresh on the next call.
  worker.onerror = (event) => {
    resetCompilerWorker(
      new Error(event.message || 'OpenType feature compiler failed')
    )
  }
  compilerWorker = worker
  return worker
}

export const compileFontWithFeatures = (
  inputFontBuffer: ArrayBuffer,
  generatedFea: string,
  options: CompileOptions,
  sourceMap?: GeneratedFeaSourceMap
): Promise<CompileResult> =>
  new Promise((resolve, reject) => {
    const worker = getCompilerWorker()
    const requestId = nextRequestId++
    pendingCompiles.set(requestId, { resolve, reject })
    worker.postMessage(
      {
        type: 'compile-font-features',
        requestId,
        payload: {
          inputFontBuffer,
          generatedFea,
          options,
          sourceMap,
        },
      },
      [inputFontBuffer]
    )
  })

// Warm the compiler ahead of the first real compile (e.g. when the feature
// workspace opens) so the first preview doesn't pay the Pyodide load.
export const prewarmOpenTypeFeatureCompiler = () => {
  getCompilerWorker().postMessage({ type: 'prewarm-compiler-runtime' })
}
