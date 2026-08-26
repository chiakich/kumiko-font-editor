import type {
  applyGitRemoteChanges,
  GitCommitAndPushResult,
  GitSyncReport,
  GitSyncTarget,
  switchGitProjectBranch,
} from 'src/lib/git/gitSync'
import type { GitCommitAuthor } from 'src/lib/git/worktree'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'

type ApplyRemoteResult = Awaited<ReturnType<typeof applyGitRemoteChanges>>
type SwitchBranchResult = Awaited<ReturnType<typeof switchGitProjectBranch>>

interface ReportResponse {
  type: 'git-sync-report-success'
  payload: { requestId: string; report: GitSyncReport }
}

interface CommitResponse {
  type: 'git-commit-success'
  payload: { requestId: string; result: GitCommitAndPushResult }
}

interface ApplyResponse {
  type: 'git-apply-success'
  payload: { requestId: string; result: ApplyRemoteResult }
}

interface SwitchBranchResponse {
  type: 'git-switch-branch-success'
  payload: { requestId: string; result: SwitchBranchResult }
}

interface ErrorResponse {
  type: 'git-sync-error'
  payload: { requestId: string; message: string }
}

type WorkerResponse =
  | ReportResponse
  | CommitResponse
  | ApplyResponse
  | SwitchBranchResponse
  | ErrorResponse

interface PendingRequest {
  resolve: (value: never) => void
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
          pending.resolve(event.data.payload.report as never)
          return
        }
        if (
          event.data.type === 'git-commit-success' ||
          event.data.type === 'git-apply-success' ||
          event.data.type === 'git-switch-branch-success'
        ) {
          pending.resolve(event.data.payload.result as never)
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

const request = <T>(type: string, payload: Record<string, unknown>) =>
  new Promise<T>((resolve, reject) => {
    const requestId = createRequestId()
    pendingRequests.set(requestId, {
      resolve: resolve as (value: never) => void,
      reject,
    })
    try {
      getWorker().postMessage({ type, payload: { requestId, ...payload } })
    } catch (error) {
      pendingRequests.delete(requestId)
      reject(
        error instanceof Error ? error : new Error('無法啟動 git 同步 worker。')
      )
    }
  })

// The report hashes only dirty entities on its normal path, but fetching and
// walking the remote tree can still be substantial for a CJK-scale font. Keep
// that work off the UI thread; OPFS and IndexedDB are both worker-safe and the
// worker gets the createSyncAccessHandle fast path.
export const buildGitSyncReportInWorker = (target: GitSyncTarget) =>
  request<GitSyncReport>('build-git-sync-report', { target })

// Materializing, staging and pushing a CJK-scale font is the same tens of
// thousands of files the report walks — it has no business on the main thread.
export const commitAndPushProjectInWorker = (input: {
  projectId: string
  pushRepo: string
  pushBranch: string
  baseRepo: string | null
  baseBranch: string | null
  message: string
  author: GitCommitAuthor
  excludePaths?: readonly string[]
  excludeGlyphIds?: readonly string[]
}) => request<GitCommitAndPushResult>('commit-and-push', { ...input })

// Pulling parses every remote glif it touches. That used to need DOMParser,
// which pinned it to the main thread; the parser is DOM-free now, so it runs
// here like the rest of the git work.
export const applyGitRemoteChangesInWorker = (input: {
  projectId: string
  report: ProjectSyncReport
  resolutions?: Record<string, SyncConflictResolution>
  remoteHeadSha: string
}) => request<ApplyRemoteResult>('apply-remote', { ...input })

export const switchGitProjectBranchInWorker = (target: GitSyncTarget) =>
  request<SwitchBranchResult>('switch-git-branch', { target })
