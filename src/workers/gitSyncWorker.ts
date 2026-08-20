/// <reference lib="webworker" />
import {
  buildGitSyncReport,
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

interface ReportSuccessResponse {
  type: 'git-sync-report-success'
  payload: {
    requestId: string
    report: GitSyncReport
  }
}

interface ReportErrorResponse {
  type: 'git-sync-report-error'
  payload: {
    requestId: string
    message: string
  }
}

type GitSyncResponse = ReportSuccessResponse | ReportErrorResponse

const post = (message: GitSyncResponse) => self.postMessage(message)

self.onmessage = async (event: MessageEvent<BuildReportRequest>) => {
  const request = event.data
  if (
    request?.type !== 'build-git-sync-report' ||
    !request.payload?.requestId
  ) {
    return
  }

  const { requestId, target } = request.payload
  try {
    post({
      type: 'git-sync-report-success',
      payload: { requestId, report: await buildGitSyncReport({ target }) },
    })
  } catch (error) {
    post({
      type: 'git-sync-report-error',
      payload: {
        requestId,
        message: error instanceof Error ? error.message : '無法檢查遠端狀態。',
      },
    })
  }
}

export {}
