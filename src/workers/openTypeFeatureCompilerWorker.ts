/// <reference lib="webworker" />

import {
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
  makeRuntimeNotConfiguredResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import type { CompileRequestMessage } from 'src/lib/openTypeFeatures/compilerTypes'

self.onmessage = async (event: MessageEvent<CompileRequestMessage>) => {
  if (event.data?.type !== 'compile-font-features') {
    return
  }

  try {
    self.postMessage(makeRuntimeNotConfiguredResponse())
  } catch (error) {
    const runtimeStatus = createCompilerRuntimeStatus()
    self.postMessage(
      makeCompilerErrorResponse({
        backend: runtimeStatus.backend,
        message:
          error instanceof Error
            ? error.message
            : 'OpenType feature compiler failed',
        rawCompilerOutput:
          error instanceof Error && error.stack ? error.stack : undefined,
        runtimeStatus,
        sourceMap: event.data.payload.sourceMap,
      })
    )
  }
}

export {}
