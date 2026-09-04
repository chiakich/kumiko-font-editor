import type { GlyphData } from '@/store'
import type { FontData } from '@/store'
import { createWorkerRpcClient } from '@/lib/workers/createWorkerRpcClient'

export interface BuildSfntPayload {
  fontData: Pick<
    FontData,
    | 'fontInfo'
    | 'unitsPerEm'
    | 'lineMetricsHorizontalLayout'
    | 'openTypeFeatures'
    | 'kerningGroups'
    | 'kerningPairs'
    | 'verticalKerningPairs'
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

const client = createWorkerRpcClient<BuildSfntResponseMessage>({
  createWorker: () =>
    new Worker(new URL('../../workers/previewSfntWorker.ts', import.meta.url), {
      type: 'module',
    }),
  getRequestId: (response) => response.requestId,
  toOutcome: (response) =>
    response.type === 'sfnt-success'
      ? { status: 'success', value: response.buffer }
      : { status: 'error', error: new Error(response.message) },
  workerErrorMessage: 'sfnt build worker failed',
})

// Builds the pre-feature sfnt off the main thread. Glyph data crosses via
// structured clone, which is far cheaper than the outline serialization the
// worker does with it.
export const buildSfntInWorker = (payload: BuildSfntPayload) =>
  client.request<ArrayBuffer>(
    (requestId) =>
      ({
        type: 'build-sfnt',
        requestId,
        payload,
      }) satisfies BuildSfntRequestMessage
  )
