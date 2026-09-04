import type {
  BuildOverviewPreviewsMessage,
  BuildOverviewPreviewsPayload,
  OverviewPreviewWorkerIncomingMessage,
  OverviewPreviewWorkerResult,
} from '@/features/fontOverview/utils/overviewPreviewWorkerTypes'
import { createWorkerRpcClient } from '@/lib/workers/createWorkerRpcClient'

const client = createWorkerRpcClient<OverviewPreviewWorkerIncomingMessage>({
  createWorker: () =>
    new Worker(
      new URL(
        '../../../workers/overviewGlyphPreviewWorker.ts',
        import.meta.url
      ),
      { type: 'module' }
    ),
  getRequestId: (response) => response.requestId,
  toOutcome: (response) =>
    response.type === 'build-overview-previews-error'
      ? { status: 'error', error: new Error(response.message) }
      : { status: 'success', value: response.results },
  workerErrorMessage: 'Overview preview worker failed',
})

export const buildOverviewGlyphPreviews = (
  payload: BuildOverviewPreviewsPayload
) =>
  client.request<OverviewPreviewWorkerResult[]>(
    (requestId) =>
      ({
        type: 'build-overview-previews',
        requestId,
        payload,
      }) satisfies BuildOverviewPreviewsMessage
  )
