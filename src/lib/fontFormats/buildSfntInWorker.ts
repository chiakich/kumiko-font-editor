import type { GlyphData } from 'src/store'
import type { FontData } from 'src/store'

export interface BuildSfntPayload {
  fontData: Pick<
    FontData,
    | 'fontInfo'
    | 'unitsPerEm'
    | 'lineMetricsHorizontalLayout'
    | 'openTypeFeatures'
    | 'kerningGroups'
    | 'kerningPairs'
  >
  glyphs: GlyphData[]
}

export interface BuildSfntRequestMessage {
  type: 'build-sfnt'
  requestId: number
  payload: BuildSfntPayload
}

type BuildSfntResponseMessage =
  | { type: 'sfnt-success'; requestId: number; buffer: ArrayBuffer }
  | { type: 'sfnt-error'; requestId: number; message: string }

interface PendingBuild {
  resolve: (buffer: ArrayBuffer) => void
  reject: (error: Error) => void
}

let sfntWorker: Worker | null = null
let nextRequestId = 1
const pendingBuilds = new Map<number, PendingBuild>()

const getSfntWorker = () => {
  if (sfntWorker) {
    return sfntWorker
  }
  const worker = new Worker(
    new URL('../../workers/previewSfntWorker.ts', import.meta.url),
    { type: 'module' }
  )
  worker.onmessage = (event: MessageEvent<BuildSfntResponseMessage>) => {
    const pending = pendingBuilds.get(event.data.requestId)
    if (!pending) {
      return
    }
    pendingBuilds.delete(event.data.requestId)
    if (event.data.type === 'sfnt-success') {
      pending.resolve(event.data.buffer)
    } else {
      pending.reject(new Error(event.data.message))
    }
  }
  worker.onerror = (event) => {
    sfntWorker?.terminate()
    sfntWorker = null
    const failed = [...pendingBuilds.values()]
    pendingBuilds.clear()
    const error = new Error(event.message || 'sfnt build worker failed')
    for (const entry of failed) {
      entry.reject(error)
    }
  }
  sfntWorker = worker
  return worker
}

// Builds the pre-feature sfnt off the main thread. Glyph data crosses via
// structured clone, which is far cheaper than the outline serialization the
// worker does with it.
export const buildSfntInWorker = (
  payload: BuildSfntPayload
): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const worker = getSfntWorker()
    const requestId = nextRequestId++
    pendingBuilds.set(requestId, { resolve, reject })
    worker.postMessage({ type: 'build-sfnt', requestId, payload })
  })
