import type {
  CompileOptions,
  CompileResponseMessage,
  CompileResult,
} from 'src/lib/openTypeFeatures/compilerTypes'
import type { GeneratedFeaSourceMap } from 'src/lib/openTypeFeatures/feaAst'

export const compileFontWithFeatures = (
  inputFontBuffer: ArrayBuffer,
  generatedFea: string,
  options: CompileOptions,
  sourceMap?: GeneratedFeaSourceMap
): Promise<CompileResult> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL(
        '../../workers/openTypeFeatureCompilerWorker.ts',
        import.meta.url
      ),
      { type: 'module' }
    )

    worker.onmessage = (event: MessageEvent<CompileResponseMessage>) => {
      worker.terminate()
      if (event.data.type === 'compile-success') {
        resolve(event.data.payload)
        return
      }

      const error = new Error(event.data.payload.message)
      Object.assign(error, {
        diagnostics: event.data.payload.diagnostics,
        rawCompilerOutput: event.data.payload.rawCompilerOutput,
      })
      reject(error)
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'OpenType feature compiler failed'))
    }

    worker.postMessage(
      {
        type: 'compile-font-features',
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
