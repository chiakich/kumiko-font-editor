import type { RadarReferenceData } from 'src/lib/qualityCheck/qualityRadar'
import type { ReferenceResidualWorkerResponse } from 'src/workers/referenceResidualWorker'

export interface ReferenceResidualBuildResult {
  referenceData: RadarReferenceData
  sampleCount: number
  entryCount: number
}

let workerInstance: Worker | null = null
let nextRequestId = 0

const getWorker = () => {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/referenceResidualWorker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return workerInstance
}

export const buildReferenceResidualData = (
  fontName: string,
  fontBytes: ArrayBuffer
): Promise<ReferenceResidualBuildResult> =>
  new Promise((resolve, reject) => {
    nextRequestId += 1
    const requestId = nextRequestId
    const worker = getWorker()

    const handleMessage = (
      event: MessageEvent<ReferenceResidualWorkerResponse>
    ) => {
      if (event.data.payload.requestId !== requestId) {
        return
      }
      worker.removeEventListener('message', handleMessage)
      if (event.data.type === 'reference-residual-success') {
        resolve({
          referenceData: event.data.payload.referenceData,
          sampleCount: event.data.payload.sampleCount,
          entryCount: event.data.payload.entryCount,
        })
      } else {
        reject(new Error(event.data.payload.message))
      }
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage({
      type: 'build-reference-residual',
      payload: {
        requestId,
        fontName,
        fontBytes,
      },
    })
  })
