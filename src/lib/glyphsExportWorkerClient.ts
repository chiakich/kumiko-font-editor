import type { GlyphData } from 'src/store'

interface ExportSuccessMessage {
  type: 'export-success'
  payload: {
    blob: Blob
  }
}

interface ExportErrorMessage {
  type: 'export-error'
  payload: {
    message: string
  }
}

type ExportResponseMessage = ExportSuccessMessage | ExportErrorMessage

export const exportGlyphsWithWorker = (input: {
  projectId: string
  dirtyGlyphs: Record<string, GlyphData>
}) =>
  new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/glyphsExportWorker.ts', import.meta.url),
      {
        type: 'module',
      }
    )

    worker.onmessage = (event: MessageEvent<ExportResponseMessage>) => {
      worker.terminate()
      if (event.data.type === 'export-success') {
        resolve(event.data.payload.blob)
        return
      }

      reject(new Error(event.data.payload.message))
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Glyphs export worker failed'))
    }

    worker.postMessage({
      type: 'export-glyphs',
      payload: input,
    })
  })
