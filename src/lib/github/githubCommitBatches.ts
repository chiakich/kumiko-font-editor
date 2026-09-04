import { createGitHubCommit } from '@/lib/github/githubAuth'

export interface GitHubCommitFile {
  path: string
  content?: string
  deleted?: boolean
}

export interface GitHubCommitBatchLimits {
  maxFiles: number
  maxBytes: number
}

// A whole-project sync sends every dirty glyph, which does not fit in one
// request: the Pages Function has to hold the parsed body in memory and dies
// with a platform 502 rather than an error we can report. Batches commit onto
// the same branch one after another instead.
export const GITHUB_COMMIT_BATCH_LIMITS: GitHubCommitBatchLimits = {
  maxFiles: 500,
  maxBytes: 4 * 1024 * 1024,
}

// Rough byte estimate: .glif/.plist payloads are ASCII-dominated XML, and the
// byte budget is an order of magnitude below the actual request limit.
const estimateFileBytes = (file: GitHubCommitFile) =>
  file.path.length + (file.content?.length ?? 0)

export const splitCommitFiles = (
  files: GitHubCommitFile[],
  limits: GitHubCommitBatchLimits = GITHUB_COMMIT_BATCH_LIMITS
): GitHubCommitFile[][] => {
  const batches: GitHubCommitFile[][] = []
  let current: GitHubCommitFile[] = []
  let currentBytes = 0

  for (const file of files) {
    const fileBytes = estimateFileBytes(file)
    if (
      current.length > 0 &&
      (current.length >= limits.maxFiles ||
        currentBytes + fileBytes > limits.maxBytes)
    ) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += fileBytes
  }

  if (current.length > 0) {
    batches.push(current)
  }
  return batches
}

export const createGitHubCommitInBatches = async (payload: {
  repo: string
  baseBranch: string
  commitMessage: string
  branchName?: string
  files: GitHubCommitFile[]
}) => {
  const batches = splitCommitFiles(payload.files)
  // the first response names the branch when the caller left it blank, so the
  // remaining batches land on that same branch instead of creating new ones
  let branchName = payload.branchName
  let result: Awaited<ReturnType<typeof createGitHubCommit>> | null = null

  for (const [index, files] of batches.entries()) {
    result = await createGitHubCommit({
      ...payload,
      branchName,
      files,
      commitMessage:
        batches.length > 1
          ? `${payload.commitMessage} (${index + 1}/${batches.length})`
          : payload.commitMessage,
    })
    branchName = result.branchName
  }

  if (!result) {
    throw new Error('沒有可提交的檔案變更')
  }
  return result
}
