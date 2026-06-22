/// <reference lib="webworker" />

import { buildGlyphPreviewData } from 'src/lib/glyph/glyphPreviewData'
import type {
  BuildOverviewPreviewsErrorMessage,
  BuildOverviewPreviewsMessage,
  BuildOverviewPreviewsSuccessMessage,
} from 'src/features/fontOverview/utils/overviewPreviewWorkerTypes'

const post = (
  message:
    | BuildOverviewPreviewsSuccessMessage
    | BuildOverviewPreviewsErrorMessage
) => {
  ;(self as DedicatedWorkerGlobalScope).postMessage(message)
}

self.onmessage = (event: MessageEvent<BuildOverviewPreviewsMessage>) => {
  if (event.data.type !== 'build-overview-previews') {
    return
  }

  const { requestId, payload } = event.data
  try {
    const results = payload.requests.map((request) => {
      const glyph = payload.glyphs[request.glyphId]
      return {
        cacheKey: request.cacheKey,
        glyphId: request.glyphId,
        preview: glyph
          ? buildGlyphPreviewData(
              glyph,
              payload.glyphs,
              payload.unitsPerEm,
              payload.activeMasterId,
              {
                dependencyKey: request.cacheKey,
                useCache: false,
              }
            )
          : null,
      }
    })

    post({
      type: 'build-overview-previews-success',
      requestId,
      results,
    })
  } catch (error) {
    post({
      type: 'build-overview-previews-error',
      requestId,
      message:
        error instanceof Error ? error.message : 'Overview preview failed',
    })
  }
}
