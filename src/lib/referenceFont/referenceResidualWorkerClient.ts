import type { RadarReferenceData } from 'src/lib/qualityCheck/qualityRadar'
import type { ReferenceResidualWorkerResponse } from 'src/workers/referenceResidualWorker'
import { createWorkerRpcClient } from 'src/lib/workers/createWorkerRpcClient'

export interface ReferenceResidualBuildResult {
  referenceData: RadarReferenceData
  sampleCount: number
  entryCount: number
}

const client = createWorkerRpcClient<ReferenceResidualWorkerResponse>({
  createWorker: () =>
    new Worker(
      new URL('../../workers/referenceResidualWorker.ts', import.meta.url),
      {
        type: 'module',
      }
    ),
  getRequestId: (response) => response.payload.requestId,
  toOutcome: (response) =>
    response.type === 'reference-residual-success'
      ? {
          status: 'success',
          value: {
            referenceData: response.payload.referenceData,
            sampleCount: response.payload.sampleCount,
            entryCount: response.payload.entryCount,
          } satisfies ReferenceResidualBuildResult,
        }
      : { status: 'error', error: new Error(response.payload.message) },
  workerErrorMessage: 'Reference residual worker failed.',
})

export const buildReferenceResidualData = (
  fontName: string,
  fontBytes: ArrayBuffer
) =>
  client.request<ReferenceResidualBuildResult>((requestId) => ({
    type: 'build-reference-residual',
    payload: { requestId, fontName, fontBytes },
  }))
