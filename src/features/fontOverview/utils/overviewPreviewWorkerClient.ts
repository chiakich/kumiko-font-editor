import type {
  BuildOverviewPreviewsMessage,
  BuildOverviewPreviewsPayload,
  OverviewPreviewWorkerIncomingMessage,
  OverviewPreviewWorkerResult,
} from 'src/features/fontOverview/utils/overviewPreviewWorkerTypes'

let workerInstance: Worker | null = null
let nextRequestId = 1

const pendingRequests = new Map<
  number,
  {
    reject: (error: Error) => void
    resolve: (results: OverviewPreviewWorkerResult[]) => void
  }
>()

const getWorker = () => {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL(
        '../../../workers/overviewGlyphPreviewWorker.ts',
        import.meta.url
      ),
      { type: 'module' }
    )
    workerInstance.addEventListener(
      'message',
      (event: MessageEvent<OverviewPreviewWorkerIncomingMessage>) => {
        const pending = pendingRequests.get(event.data.requestId)
        if (!pending) {
          return
        }

        pendingRequests.delete(event.data.requestId)
        if (event.data.type === 'build-overview-previews-error') {
          pending.reject(new Error(event.data.message))
          return
        }

        pending.resolve(event.data.results)
      }
    )
    workerInstance.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Overview preview worker failed')
      for (const pending of pendingRequests.values()) {
        pending.reject(error)
      }
      pendingRequests.clear()
      workerInstance?.terminate()
      workerInstance = null
    })
  }

  return workerInstance
}

export const buildOverviewGlyphPreviews = (
  payload: BuildOverviewPreviewsPayload
) =>
  new Promise<OverviewPreviewWorkerResult[]>((resolve, reject) => {
    const requestId = nextRequestId
    nextRequestId += 1
    pendingRequests.set(requestId, { reject, resolve })
    const message: BuildOverviewPreviewsMessage = {
      type: 'build-overview-previews',
      requestId,
      payload,
    }
    getWorker().postMessage(message)
  })
