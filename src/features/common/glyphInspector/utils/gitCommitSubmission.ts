import { fetchGitHubCompareStatus } from 'src/lib/github/githubAuth'
import type { GitHubForkStatus } from 'src/lib/github/githubAuth'

export interface GitCommitSubmissionResult {
  headOwner: string
  branchName: string
  commitSha: string
  compare: GitHubForkStatus['compare']
}

// Commits and pushes through the git transport, then reports the same shape the
// REST commit endpoint returns so the surrounding UI is transport-agnostic.
export const commitThroughGit = async (input: {
  projectId: string
  projectTitle: string
  branchName: string
  commitMessage: string
  forkStatus: GitHubForkStatus | null
}): Promise<GitCommitSubmissionResult> => {
  const targetRepo = input.forkStatus?.targetRepo
  if (!targetRepo) {
    throw new Error('尚未找到你的 fork，請先建立 fork。')
  }
  if (!input.branchName) {
    throw new Error('請輸入有效的 branch 名稱')
  }

  const { commitAndPushProject, markGitCommitSynced } =
    await import('src/lib/git/gitSync')

  const sourceRepo = input.forkStatus?.sourceRepo ?? null
  const pushed = await commitAndPushProject({
    projectId: input.projectId,
    pushRepo: targetRepo.fullName,
    pushBranch: input.branchName,
    // Start a new patch branch from upstream so the pull request diffs against
    // the real base instead of an unrelated history.
    baseRepo: sourceRepo?.fullName ?? null,
    baseBranch: sourceRepo?.defaultBranch ?? null,
    message: input.commitMessage || `Update ${input.projectTitle}`,
  })

  await markGitCommitSynced({
    projectId: input.projectId,
    pushedRepo: pushed.pushedRepo,
    pushedBranch: pushed.pushedBranch,
    commitSha: pushed.commitSha,
    writtenPaths: pushed.writtenPaths,
  })

  // The PR affordances read compare status, which stays a REST concern.
  const compare = sourceRepo
    ? await fetchGitHubCompareStatus({
        repo: sourceRepo.fullName,
        headOwner: targetRepo.owner,
        headBranch: pushed.pushedBranch,
      })
        .then((response) => response.compare)
        .catch(() => null)
    : null

  return {
    headOwner: targetRepo.owner,
    branchName: pushed.pushedBranch,
    commitSha: pushed.commitSha,
    compare,
  }
}
