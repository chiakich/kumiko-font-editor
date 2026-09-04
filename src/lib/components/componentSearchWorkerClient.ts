import { createWorkerRpcClient } from 'src/lib/workers/createWorkerRpcClient'

interface ProjectGlyphSummary {
  id: string
  name: string
  unicode: string | null
}

interface SearchResult {
  components: string[]
  activeComponent: string | null
  glyphIds: string[]
}

interface SearchSuccessMessage {
  type: 'search-success'
  payload: {
    requestId: string
    components: string[]
    activeComponent: string | null
    glyphIds: string[]
  }
}

interface SearchErrorMessage {
  type: 'search-error'
  payload: {
    requestId: string
    message: string
  }
}

type WorkerResponseMessage = SearchSuccessMessage | SearchErrorMessage

const client = createWorkerRpcClient<WorkerResponseMessage, string>({
  createWorker: () =>
    new Worker(
      new URL('../../workers/componentSearchWorker.ts', import.meta.url),
      { type: 'module' }
    ),
  createRequestId: (sequence) => `component-search-${sequence}`,
  getRequestId: (response) => response.payload.requestId,
  toOutcome: (response) =>
    response.type === 'search-success'
      ? { status: 'success', value: response.payload satisfies SearchResult }
      : { status: 'error', error: new Error(response.payload.message) },
  workerErrorMessage: 'Component search worker failed.',
})

export const searchProjectGlyphsByComponent = (input: {
  character: string
  selectedComponent?: string | null
  currentGlyphId?: string | null
  projectGlyphs: ProjectGlyphSummary[]
  signal?: AbortSignal
}) =>
  client.request<SearchResult>(
    (requestId) => ({
      type: 'search-components',
      payload: {
        requestId,
        character: input.character,
        selectedComponent: input.selectedComponent,
        currentGlyphId: input.currentGlyphId,
        projectGlyphs: input.projectGlyphs,
      },
    }),
    {
      signal: input.signal,
      abortReason: 'Search aborted',
      onAbort: (requestId, worker) => {
        worker.postMessage({ type: 'cancel-search', payload: { requestId } })
      },
    }
  )
