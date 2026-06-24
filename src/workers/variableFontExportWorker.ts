/// <reference lib="webworker" />

import { buildVariableFontWithFontToolsRuntime } from 'src/lib/openTypeFeatures/fontToolsPyodideRuntime'

interface VariableFontBuildRequest {
  type: 'variable-font-build'
  payload: {
    designspaceText: string
    masters: Array<{ fileName: string; fontBuffer: ArrayBuffer }>
  }
}

self.onmessage = async (event: MessageEvent<VariableFontBuildRequest>) => {
  if (event.data?.type !== 'variable-font-build') {
    return
  }

  try {
    const result = await buildVariableFontWithFontToolsRuntime(
      event.data.payload
    )
    self.postMessage(
      {
        type: 'variable-font-build-success',
        payload: result,
      },
      [result.fontBuffer]
    )
  } catch (error) {
    self.postMessage({
      type: 'variable-font-build-error',
      payload: {
        message:
          error instanceof Error
            ? error.message
            : 'Variable font export failed',
        rawCompilerOutput:
          error instanceof Error && 'rawCompilerOutput' in error
            ? String(error.rawCompilerOutput)
            : undefined,
      },
    })
  }
}

export {}
