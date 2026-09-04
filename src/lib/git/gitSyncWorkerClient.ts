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
import { createWorkerRpcClient } from 'src/lib/workers/createWorkerRpcClient'

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

const client = createWorkerRpcClient<WorkerResponse, string>({
  createWorker: () =>
    new Worker(new URL('../../workers/gitSyncWorker.ts', import.meta.url), {
      type: 'module',
    }),
  createRequestId: (sequence) => `git-sync-request-${sequence}`,
  getRequestId: (response) => response.payload?.requestId,
  toOutcome: (response) => {
    if (response.type === 'git-sync-report-success') {
      return { status: 'success', value: response.payload.report }
    }
    if (response.type === 'git-sync-error') {
      return { status: 'error', error: new Error(response.payload.message) }
    }
    return { status: 'success', value: response.payload.result }
  },
  workerErrorMessage: 'git sync worker failed.',
})

const request = <T>(type: string, payload: Record<string, unknown>) =>
  client.request<T>((requestId) => ({
    type,
    payload: { requestId, ...payload },
  }))

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
