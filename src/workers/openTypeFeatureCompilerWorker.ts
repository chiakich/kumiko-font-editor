/// <reference lib="webworker" />

import {
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import {
  compileWithFontToolsRuntime,
  getFontToolsRuntime,
} from 'src/lib/openTypeFeatures/fontToolsPyodideRuntime'
import type {
  CompileRequestMessage,
  CompileSuccessMessage,
} from 'src/lib/openTypeFeatures/compilerTypes'

interface RuntimeCompileError {
  message?: string
  rawCompilerOutput?: string
}

const toRuntimeCompileError = (error: unknown): RuntimeCompileError => {
  if (error instanceof Error) {
    return {
      message: error.message,
      rawCompilerOutput: error.stack,
    }
  }

  return error as RuntimeCompileError
}

self.onmessage = async (
  event: MessageEvent<CompileRequestMessage | { type: string }>
) => {
  if (event.data?.type === 'prewarm-compiler-runtime') {
    // Fire-and-forget: load Pyodide + fontTools before the first compile asks.
    void getFontToolsRuntime().catch(() => {})
    return
  }
  if (event.data?.type !== 'compile-font-features') {
    return
  }
  const { requestId } = event.data as CompileRequestMessage

  try {
    const payload = (event.data as CompileRequestMessage).payload
    const result = await compileWithFontToolsRuntime(
      payload.inputFontBuffer,
      payload.generatedFea,
      payload.options
    )
    const response: CompileSuccessMessage = {
      type: 'compile-success',
      requestId,
      payload: result,
    }

    self.postMessage(response, [result.fontBuffer])
  } catch (error) {
    const runtimeStatus = createCompilerRuntimeStatus('pyodide-fonttools')
    const compileError = toRuntimeCompileError(error)
    const message =
      typeof compileError.message === 'string'
        ? compileError.message
        : 'OpenType feature compiler failed'

    self.postMessage({
      ...makeCompilerErrorResponse({
        backend: runtimeStatus.backend,
        message,
        rawCompilerOutput: compileError.rawCompilerOutput,
        runtimeStatus,
        sourceMap: (event.data as CompileRequestMessage).payload.sourceMap,
      }),
      requestId,
    })
  }
}

export {}
