import type { GitHubForkStatus } from '@/lib/github/githubAuth'
import type { GitHubSyncTarget } from '@/lib/github/sync/types'
import type { KumikoProjectRecord } from '@/lib/project/kumikoProjectTypes'
import type { GitHubSubmitResult } from '@/features/common/glyphInspector/components/GitHubCommitModal'
import type { GitCommitSubmissionResult } from '@/features/common/glyphInspector/utils/gitCommitSubmission'
import { buildSuggestedGitHubBranchName } from '@/features/common/glyphInspector/utils/githubCommitFlowUtils'

export interface ScopedForkStatusOverride {
  repoFullName: string | null
  forkStatus: GitHubForkStatus | null
}

export interface ScopedGitHubCommitDraft {
  repoFullName: string | null
  commitMessage: string
  branchName: string
  isCreatingNewBranch: boolean
}

export type GitHubCommitDraftUpdate = Partial<
  Omit<ScopedGitHubCommitDraft, 'repoFullName'>
>

export interface ScopedVoidedLines {
  repoFullName: string | null
  keys: string[]
}

export interface GitCollaborationState {
  activeTarget: GitHubSyncTarget | null
  changeDrafts: GitHubSyncTarget[]
}

export const createEmptyCommitDraft = (
  repoFullName: string | null
): ScopedGitHubCommitDraft => ({
  repoFullName,
  commitMessage: '',
  branchName: '',
  isCreatingNewBranch: false,
})

export const resolveActiveCommitDraft = (
  draft: ScopedGitHubCommitDraft,
  repoFullName: string | null
): ScopedGitHubCommitDraft =>
  draft.repoFullName === repoFullName
    ? draft
    : createEmptyCommitDraft(repoFullName)

export const mergeCommitDraft = (
  current: ScopedGitHubCommitDraft,
  repoFullName: string | null,
  update: GitHubCommitDraftUpdate
): ScopedGitHubCommitDraft => ({
  ...resolveActiveCommitDraft(current, repoFullName),
  ...update,
})

export const resolveForkStatusOverride = (
  state: ScopedForkStatusOverride,
  repoFullName: string | null,
  hasGitHubSource: boolean
): GitHubForkStatus | null =>
  hasGitHubSource && state.repoFullName === repoFullName
    ? state.forkStatus
    : null

export const resolveVoidedLineKeys = (
  voidedLines: ScopedVoidedLines,
  repoFullName: string | null
): string[] =>
  voidedLines.repoFullName === repoFullName ? voidedLines.keys : []

export const toggleVoidedLineKey = (keys: string[], key: string): string[] =>
  keys.includes(key) ? keys.filter((entry) => entry !== key) : [...keys, key]

export const collaborationStateFromProjectRecord = (
  project: KumikoProjectRecord | undefined
): GitCollaborationState => ({
  activeTarget: project?.sourceData?.ufo?.lastSync ?? null,
  changeDrafts: project?.sourceData?.ufo?.gitCollaboration?.changeDrafts ?? [],
})

// The active target only counts as a resumable draft when it lives on the fork
// and is one of the drafts this project has submitted before.
export const isActiveSubmittedDraft = (
  collaboration: GitCollaborationState,
  forkStatus: GitHubForkStatus | null
): boolean => {
  const activeTarget = collaboration.activeTarget
  return Boolean(
    activeTarget &&
    forkStatus?.targetRepo &&
    activeTarget.owner === forkStatus.targetRepo.owner &&
    activeTarget.repo === forkStatus.targetRepo.repo &&
    collaboration.changeDrafts.some(
      (draft) =>
        draft.owner === activeTarget.owner &&
        draft.repo === activeTarget.repo &&
        draft.ref === activeTarget.ref
    )
  )
}

// Empty when the user already picked a branch: the message field and an
// explicit selection are left exactly as they were.
export const resolveOpenModalDraftUpdate = (input: {
  selectedBranch: string
  collaboration: GitCollaborationState
  forkStatus: GitHubForkStatus | null
  localDirtyGlyphIds: string[]
}): GitHubCommitDraftUpdate => {
  if (input.selectedBranch) {
    return {}
  }
  const activeDraft = isActiveSubmittedDraft(
    input.collaboration,
    input.forkStatus
  )
  return {
    branchName: activeDraft
      ? input.collaboration.activeTarget!.ref
      : buildSuggestedGitHubBranchName(input.localDirtyGlyphIds),
    isCreatingNewBranch: !activeDraft,
  }
}

export const buildForkStatusPatchAfterCommit = (
  forkStatus: GitHubForkStatus,
  result: GitCommitSubmissionResult
) => ({
  selectedBranch: result.branchName,
  compare: result.compare,
  branches: forkStatus.branches.includes(result.branchName)
    ? forkStatus.branches
    : [result.branchName, ...forkStatus.branches],
})

export const toGitHubSubmitResult = (
  result: GitCommitSubmissionResult
): GitHubSubmitResult => ({
  branch: result.branchName,
  commitSha: result.commitSha,
  compareUrl: result.compare?.compareUrl ?? null,
})
