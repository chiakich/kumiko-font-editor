/// <reference lib="webworker" />
import {
  saveDraftSnapshot,
  type SaveDraftSnapshotInput,
} from 'src/lib/project/draftSave'
import { saveProjectUiState } from 'src/lib/project/projectRepository'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'

interface SaveDraftSnapshotRequest {
  type: 'save-draft-snapshot'
  payload: SaveDraftSnapshotInput & {
    requestId: string
  }
}

interface SaveUiStateRequest {
  type: 'save-project-ui-state'
  payload: {
    requestId: string
    projectId: string
    projectUiState: KumikoProjectUiState | null
  }
}

interface SaveSuccessResponse {
  type: 'draft-save-success'
  payload: {
    requestId: string
  }
}

interface SaveErrorResponse {
  type: 'draft-save-error'
  payload: {
    requestId: string
    message: string
  }
}

type DraftSaveRequest = SaveDraftSnapshotRequest | SaveUiStateRequest
type DraftSaveResponse = SaveSuccessResponse | SaveErrorResponse

const postSuccess = (requestId: string) => {
  const message: DraftSaveResponse = {
    type: 'draft-save-success',
    payload: { requestId },
  }
  self.postMessage(message)
}

const postError = (requestId: string, error: unknown) => {
  const message: DraftSaveResponse = {
    type: 'draft-save-error',
    payload: {
      requestId,
      message: error instanceof Error ? error.message : 'Unable to save draft.',
    },
  }
  self.postMessage(message)
}

self.onmessage = async (event: MessageEvent<DraftSaveRequest>) => {
  const request = event.data
  if (!request?.payload?.requestId) {
    return
  }

  try {
    if (request.type === 'save-project-ui-state') {
      await saveProjectUiState(
        request.payload.projectId,
        request.payload.projectUiState
      )
      postSuccess(request.payload.requestId)
      return
    }

    if (request.type === 'save-draft-snapshot') {
      const { requestId, ...input } = request.payload
      await saveDraftSnapshot(input)
      postSuccess(requestId)
    }
  } catch (error) {
    postError(request.payload.requestId, error)
  }
}

export {}
