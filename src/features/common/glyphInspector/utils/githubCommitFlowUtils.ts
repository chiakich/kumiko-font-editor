import type { GitHubForkStatus } from '@/lib/github/githubAuth'

export const isMissingGitHubTokenError = (message: string) =>
  /登入 GitHub/.test(message) ||
  /missing_token/.test(message) ||
  /401/.test(message)

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export const isExistingGitHubBranch = (
  forkStatus: GitHubForkStatus | null,
  branchName: string
) => Boolean(branchName.trim() && forkStatus?.branches.includes(branchName))

export const resolveGitHubBranchSelection = (
  forkStatus: GitHubForkStatus,
  requestedBranch?: string
) => requestedBranch?.trim() || forkStatus.selectedBranch || ''

export const buildSuggestedGitHubBranchName = (glyphNames: string[]) =>
  `kumiko/${
    glyphNames.slice(0, 2).join('-').toLowerCase() || `patch-${Date.now()}`
  }`
