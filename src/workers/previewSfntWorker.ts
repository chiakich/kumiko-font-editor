/// <reference lib="webworker" />

import { buildExportSfntBuffer } from '@/lib/fontFormats/fontBinaryFormat'
import type { BuildSfntRequestMessage } from '@/lib/fontFormats/previewSfntWorkerClient'

// Serializing thousands of glyph outlines through opentype.js is the slow,
// synchronous half of a preview compile; this worker keeps it off the UI
// thread. The feature compile itself stays on the shared compiler worker.
self.onmessage = (event: MessageEvent<BuildSfntRequestMessage>) => {
  if (event.data?.type !== 'build-sfnt') {
    return
  }
  const { requestId, payload } = event.data
  try {
    const buffer = buildExportSfntBuffer(payload)
    self.postMessage({ type: 'sfnt-success', requestId, buffer }, [buffer])
  } catch (error) {
    self.postMessage({
      type: 'sfnt-error',
      requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export {}
