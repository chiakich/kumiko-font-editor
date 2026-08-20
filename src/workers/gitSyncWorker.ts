/// <reference lib="webworker" />
import {
  buildGitSyncReport,
  commitAndPushProject,
  markGitCommitSynced,
  type GitCommitAndPushResult,
  type GitSyncReport,
  type GitSyncTarget,
} from 'src/lib/git/gitSync'

interface BuildReportRequest {
  type: 'build-git-sync-report'
  payload: {
    requestId: string
    target: GitSyncTarget
  }
}

interface CommitAndPushRequest {
  type: 'commit-and-push'
  payload: {
    requestId: string
    projectId: string
    pushRepo: string
    pushBranch: string
    baseRepo: string | null
    baseBranch: string | null
    message: string
  }
}

type GitSyncRequest = BuildReportRequest | CommitAndPushRequest

interface ReportSuccessResponse {
  type: 'git-sync-report-success'
  payload: {
    requestId: string
    report: GitSyncReport
  }
}

interface CommitSuccessResponse {
  type: 'git-commit-success'
  payload: {
    requestId: string
    result: GitCommitAndPushResult
  }
}

interface ErrorResponse {
  type: 'git-sync-error'
  payload: {
    requestId: string
    message: string
  }
}

type GitSyncResponse =
  | ReportSuccessResponse
  | CommitSuccessResponse
  | ErrorResponse

const post = (message: GitSyncResponse) => self.postMessage(message)

self.onmessage = async (event: MessageEvent<GitSyncRequest>) => {
  const request = event.data
  const requestId = request?.payload?.requestId
  if (!requestId) {
    return
  }

  try {
    if (request.type === 'build-git-sync-report') {
      post({
        type: 'git-sync-report-success',
        payload: {
          requestId,
          report: await buildGitSyncReport({ target: request.payload.target }),
        },
      })
      return
    }

    if (request.type === 'commit-and-push') {
      const { projectId, pushRepo, pushBranch, baseRepo, baseBranch, message } =
        request.payload
      const result = await commitAndPushProject({
        projectId,
        pushRepo,
        pushBranch,
        baseRepo,
        baseBranch,
        message,
      })
      // Bookkeeping stays next to the commit: it reverses the paths the commit
      // actually wrote, so it must not run against a different materialization.
      await markGitCommitSynced({
        projectId,
        pushedRepo: result.pushedRepo,
        pushedBranch: result.pushedBranch,
        commitSha: result.commitSha,
        writtenPaths: result.writtenPaths,
      })
      post({ type: 'git-commit-success', payload: { requestId, result } })
    }
  } catch (error) {
    post({
      type: 'git-sync-error',
      payload: {
        requestId,
        message: error instanceof Error ? error.message : 'git 同步操作失敗。',
      },
    })
  }
}

export {}
