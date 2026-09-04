import type { SaveDraftSnapshotInput } from '@/lib/project/draftSave'
import type { KumikoProjectUiState } from '@/lib/project/projectTypes'
import { createWorkerRpcClient } from '@/lib/workers/createWorkerRpcClient'

interface WorkerSuccessResponse {
  type: 'draft-save-success'
  payload: {
    requestId: string
  }
}

interface WorkerErrorResponse {
  type: 'draft-save-error'
  payload: {
    requestId: string
    message: string
  }
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse

const client = createWorkerRpcClient<WorkerResponse, string>({
  createWorker: () =>
    new Worker(new URL('../../workers/draftSaveWorker.ts', import.meta.url), {
      type: 'module',
    }),
  createRequestId: (sequence) => `draft-save-${sequence}`,
  getRequestId: (response) => response.payload?.requestId,
  toOutcome: (response) =>
    response.type === 'draft-save-success'
      ? { status: 'success', value: undefined }
      : { status: 'error', error: new Error(response.payload.message) },
  workerErrorMessage: 'Draft save worker failed.',
})

export const saveDraftSnapshotInWorker = (input: SaveDraftSnapshotInput) =>
  client.request<void>((requestId) => ({
    type: 'save-draft-snapshot',
    payload: { ...input, requestId },
  }))

export const saveProjectUiStateInWorker = (input: {
  projectId: string
  projectUiState: KumikoProjectUiState | null
}) =>
  client.request<void>((requestId) => ({
    type: 'save-project-ui-state',
    payload: { ...input, requestId },
  }))
