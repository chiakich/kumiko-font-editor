import type { GitSyncReport, GitSyncTarget } from 'src/lib/git/gitSync'

interface SuccessResponse {
  type: 'git-sync-report-success'
  payload: { requestId: string; report: GitSyncReport }
}

interface ErrorResponse {
  type: 'git-sync-report-error'
  payload: { requestId: string; message: string }
}

type WorkerResponse = SuccessResponse | ErrorResponse

interface PendingRequest {
  resolve: (report: GitSyncReport) => void
  reject: (error: Error) => void
}

let workerInstance: Worker | null = null
const pendingRequests = new Map<string, PendingRequest>()
let requestCounter = 0

const createRequestId = () => `git-sync-report-${(requestCounter += 1)}`

const getWorker = () => {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/gitSyncWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerInstance.addEventListener(
      'message',
      (event: MessageEvent<WorkerResponse>) => {
        const requestId = event.data?.payload?.requestId
        const pending = requestId ? pendingRequests.get(requestId) : undefined
        if (!requestId || !pending) {
          return
        }
        pendingRequests.delete(requestId)
        if (event.data.type === 'git-sync-report-success') {
          pending.resolve(event.data.payload.report)
          return
        }
        pending.reject(new Error(event.data.payload.message))
      }
    )
    workerInstance.addEventListener('error', (event) => {
      const error = new Error(event.message || 'git 同步 worker 失敗。')
      workerInstance?.terminate()
      workerInstance = null
      for (const pending of pendingRequests.values()) {
        pending.reject(error)
      }
      pendingRequests.clear()
    })
  }
  return workerInstance
}

// The report materializes and hashes the whole project: on a CJK-scale font
// that is tens of thousands of files, which freezes the tab if it runs on the
// main thread. OPFS and IndexedDB are both available to a worker, and the
// worker also gets the createSyncAccessHandle fast path.
export const buildGitSyncReportInWorker = (target: GitSyncTarget) =>
  new Promise<GitSyncReport>((resolve, reject) => {
    const requestId = createRequestId()
    pendingRequests.set(requestId, { resolve, reject })
    try {
      getWorker().postMessage({
        type: 'build-git-sync-report',
        payload: { requestId, target },
      })
    } catch (error) {
      pendingRequests.delete(requestId)
      reject(
        error instanceof Error ? error : new Error('無法啟動 git 同步 worker。')
      )
    }
  })
