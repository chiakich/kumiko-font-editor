/// <reference lib="webworker" />
import {
  applyGitRemoteChanges,
  buildGitSyncReport,
  commitAndPushProject,
  markGitCommitSynced,
  switchGitProjectBranch,
  type GitCommitAndPushResult,
  type GitSyncReport,
  type GitSyncTarget,
} from 'src/lib/git/gitSync'
import type {
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync/types'

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

interface ApplyRemoteRequest {
  type: 'apply-remote'
  payload: {
    requestId: string
    projectId: string
    report: ProjectSyncReport
    resolutions?: Record<string, SyncConflictResolution>
    remoteHeadSha: string
  }
}

interface SwitchBranchRequest {
  type: 'switch-git-branch'
  payload: { requestId: string; target: GitSyncTarget }
}

type GitSyncRequest =
  | BuildReportRequest
  | CommitAndPushRequest
  | ApplyRemoteRequest
  | SwitchBranchRequest

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

interface ApplySuccessResponse {
  type: 'git-apply-success'
  payload: {
    requestId: string
    result: Awaited<ReturnType<typeof applyGitRemoteChanges>>
  }
}

interface SwitchBranchSuccessResponse {
  type: 'git-switch-branch-success'
  payload: {
    requestId: string
    result: Awaited<ReturnType<typeof switchGitProjectBranch>>
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
  | ApplySuccessResponse
  | SwitchBranchSuccessResponse
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
      return
    }

    if (request.type === 'apply-remote') {
      const { projectId, report, resolutions, remoteHeadSha } = request.payload
      post({
        type: 'git-apply-success',
        payload: {
          requestId,
          result: await applyGitRemoteChanges({
            projectId,
            report,
            resolutions,
            remoteHeadSha,
          }),
        },
      })
      return
    }

    if (request.type === 'switch-git-branch') {
      post({
        type: 'git-switch-branch-success',
        payload: {
          requestId,
          result: await switchGitProjectBranch({
            target: request.payload.target,
          }),
        },
      })
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
