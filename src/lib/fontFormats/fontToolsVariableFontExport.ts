export interface VariableFontMasterInput {
  fileName: string
  fontBuffer: ArrayBuffer
}

interface VariableFontBuildSuccessMessage {
  type: 'variable-font-build-success'
  payload: { fontBuffer: ArrayBuffer; tables?: string[] }
}

interface VariableFontBuildErrorMessage {
  type: 'variable-font-build-error'
  payload: { message: string; rawCompilerOutput?: string }
}

type VariableFontBuildResponse =
  | VariableFontBuildSuccessMessage
  | VariableFontBuildErrorMessage

export const buildVariableFontWithFontTools = (
  designspaceText: string,
  masters: VariableFontMasterInput[]
): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../workers/variableFontExportWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (event: MessageEvent<VariableFontBuildResponse>) => {
      worker.terminate()
      if (event.data.type === 'variable-font-build-success') {
        resolve(event.data.payload.fontBuffer)
        return
      }

      const error = new Error(event.data.payload.message)
      Object.assign(error, {
        rawCompilerOutput: event.data.payload.rawCompilerOutput,
      })
      reject(error)
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Variable font export failed'))
    }

    const transfer = masters.map((master) => master.fontBuffer)
    worker.postMessage(
      {
        type: 'variable-font-build',
        payload: { designspaceText, masters },
      },
      transfer
    )
  })
