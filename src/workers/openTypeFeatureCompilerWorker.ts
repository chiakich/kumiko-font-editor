/// <reference lib="webworker" />

import {
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import { compileWithFontToolsRuntime } from 'src/lib/openTypeFeatures/fontToolsPyodideRuntime'
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

self.onmessage = async (event: MessageEvent<CompileRequestMessage>) => {
  if (event.data?.type !== 'compile-font-features') {
    return
  }

  try {
    const result = await compileWithFontToolsRuntime(
      event.data.payload.inputFontBuffer,
      event.data.payload.generatedFea,
      event.data.payload.options
    )
    const response: CompileSuccessMessage = {
      type: 'compile-success',
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

    self.postMessage(
      makeCompilerErrorResponse({
        backend: runtimeStatus.backend,
        message,
        rawCompilerOutput: compileError.rawCompilerOutput,
        runtimeStatus,
        sourceMap: event.data.payload.sourceMap,
      })
    )
  }
}

export {}
