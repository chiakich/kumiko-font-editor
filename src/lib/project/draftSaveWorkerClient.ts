import type { SaveDraftSnapshotInput } from 'src/lib/project/draftSave'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'

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

interface PendingRequest {
  resolve: () => void
  reject: (error: Error) => void
}

let workerInstance: Worker | null = null
const pendingRequests = new Map<string, PendingRequest>()

const createRequestId = () =>
  `draft-save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const rejectAllPending = (error: Error) => {
  for (const request of pendingRequests.values()) {
    request.reject(error)
  }
  pendingRequests.clear()
}

const getWorker = () => {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/draftSaveWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerInstance.addEventListener(
      'message',
      (event: MessageEvent<WorkerResponse>) => {
        const requestId = event.data?.payload?.requestId
        if (!requestId) {
          return
        }
        const pending = pendingRequests.get(requestId)
        if (!pending) {
          return
        }
        pendingRequests.delete(requestId)
        if (event.data.type === 'draft-save-success') {
          pending.resolve()
          return
        }
        pending.reject(new Error(event.data.payload.message))
      }
    )
    workerInstance.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Draft save worker failed.')
      workerInstance?.terminate()
      workerInstance = null
      rejectAllPending(error)
    })
  }

  return workerInstance
}

const postRequest = (
  message:
    | {
        type: 'save-draft-snapshot'
        payload: SaveDraftSnapshotInput & { requestId: string }
      }
    | {
        type: 'save-project-ui-state'
        payload: {
          requestId: string
          projectId: string
          projectUiState: KumikoProjectUiState | null
        }
      }
) =>
  new Promise<void>((resolve, reject) => {
    pendingRequests.set(message.payload.requestId, { resolve, reject })
    try {
      getWorker().postMessage(message)
    } catch (error) {
      pendingRequests.delete(message.payload.requestId)
      reject(error instanceof Error ? error : new Error('Draft save failed.'))
    }
  })

export const saveDraftSnapshotInWorker = async (
  input: SaveDraftSnapshotInput
) => {
  const requestId = createRequestId()
  await postRequest({
    type: 'save-draft-snapshot',
    payload: {
      ...input,
      requestId,
    },
  })
}

export const saveProjectUiStateInWorker = async (input: {
  projectId: string
  projectUiState: KumikoProjectUiState | null
}) => {
  const requestId = createRequestId()
  await postRequest({
    type: 'save-project-ui-state',
    payload: {
      ...input,
      requestId,
    },
  })
}
