import type { QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { toaster } from '@/components/ui/toaster'
import {
  gitCommitAuthorForGitHubViewer,
  type GitHubForkStatus,
  type GitHubViewer,
} from '@/lib/github/githubAuth'
import {
  applyCompareToForkStatus,
  fetchCachedGitHubCompareStatus,
  fetchCachedGitHubForkStatus,
  setForkStatusQueryData,
} from '@/lib/github/githubQueries'
import type { GlobalState } from '@/store/types'
import {
  listSyncDirtyKumikoGlyphIds,
  loadKumikoProjectRecord,
  loadKumikoUiValue,
} from '@/lib/project/kumikoProjectPersistence'
import { loadProjectDraftMetadata } from '@/lib/project/projectRepository'
import {
  sanitizeGlyphEditTimes,
  UFO_GLYPH_EDIT_TIMES_KEY,
} from '@/lib/glyph/glyphEditTimes'
import {
  getErrorMessage,
  isExistingGitHubBranch,
  isMissingGitHubTokenError,
  resolveGitHubBranchSelection,
} from '@/features/common/glyphInspector/utils/githubCommitFlowUtils'
import {
  buildForkStatusPatchAfterCommit,
  collaborationStateFromProjectRecord,
  resolveOpenModalDraftUpdate,
  toGitHubSubmitResult,
  type GitCollaborationState,
  type GitHubCommitDraftUpdate,
} from '@/features/common/glyphInspector/utils/gitHubCommitFlowState'
import type { GitHubSubmitResult } from '@/features/common/glyphInspector/components/GitHubCommitModal'
import {
  resolveReceiptExclusions,
  type ChangeReceipt,
} from '@/features/common/glyphInspector/utils/changeReceipt'
import { githubSyncReportQueryKey } from '@/features/common/glyphInspector/hooks/useGitHubSyncStatus'
import { projectSyncDirtyStatusQueryKey } from '@/features/common/glyphInspector/hooks/useProjectSyncDirtyStatus'
import { commitThroughGit } from '@/features/common/glyphInspector/utils/gitCommitSubmission'

// Everything the hook holds that more than one action reads. Built per render
// so each action sees the same snapshot the hook's closures used to see.
export interface GitHubCommitFlowContext {
  t: TFunction
  queryClient: QueryClient
  githubRepoFullName: string | null
  githubForkStatus: GitHubForkStatus | null
  setForkStatusOverride: (forkStatus: GitHubForkStatus | null) => void
  updateGitHubCommitDraft: (update: GitHubCommitDraftUpdate) => void
  setGitCollaboration: (state: GitCollaborationState) => void
}

type ProjectStateLoaders = Pick<
  GlobalState,
  'loadProjectState' | 'hydratePersistedLocalChanges'
>

export const loadGitHubForkStatus = async (
  ctx: GitHubCommitFlowContext,
  branchName?: string,
  options: { syncDraftSelection?: boolean } = {}
) => {
  if (!ctx.githubRepoFullName) {
    return null
  }

  try {
    const forkStatus = await fetchCachedGitHubForkStatus(ctx.queryClient, {
      repo: ctx.githubRepoFullName,
      branch: branchName,
    })
    ctx.setForkStatusOverride(forkStatus)
    const resolvedBranch = resolveGitHubBranchSelection(forkStatus, branchName)
    if (resolvedBranch && options.syncDraftSelection !== false) {
      ctx.updateGitHubCommitDraft({
        branchName: resolvedBranch,
        isCreatingNewBranch: !isExistingGitHubBranch(
          forkStatus,
          resolvedBranch
        ),
      })
    }
    return forkStatus
  } catch (error) {
    const message = getErrorMessage(
      error,
      ctx.t('glyphInspector.toast.forkStatusFailedDescription')
    )

    if (isMissingGitHubTokenError(message)) {
      ctx.setForkStatusOverride(null)
      return null
    }

    toaster.create({
      title: ctx.t('glyphInspector.toast.forkStatusFailedTitle'),
      description: message,
      type: 'error',
      duration: 3600,
      closable: true,
    })
    return null
  }
}

export const refreshGitHubCompareStatus = async (
  ctx: GitHubCommitFlowContext,
  branchName: string
) => {
  const { githubForkStatus, queryClient } = ctx
  if (!githubForkStatus?.targetRepo || !branchName.trim()) {
    return
  }

  const selectedBranch = branchName.trim()
  const compareStatus = await fetchCachedGitHubCompareStatus(queryClient, {
    repo: githubForkStatus.sourceRepo.fullName,
    headOwner: githubForkStatus.targetRepo.owner,
    headBranch: selectedBranch,
  })

  ctx.setForkStatusOverride(
    setForkStatusQueryData(
      queryClient,
      applyCompareToForkStatus(githubForkStatus, compareStatus, selectedBranch)
    )
  )
}

export const reloadProjectFromPersistence = async (
  store: ProjectStateLoaders,
  nextProjectId: string
) => {
  const loadedProject = await loadProjectDraftMetadata(nextProjectId)
  if (!loadedProject) {
    return
  }
  store.loadProjectState(
    loadedProject.id,
    loadedProject.title,
    loadedProject.fontData!,
    loadedProject.projectMetadata,
    loadedProject.projectSourceFormat ?? null,
    loadedProject.projectRoundTripFormat ?? null,
    loadedProject.projectUiState
  )
  store.hydratePersistedLocalChanges(
    await listSyncDirtyKumikoGlyphIds(nextProjectId),
    [],
    sanitizeGlyphEditTimes(
      await loadKumikoUiValue(nextProjectId, UFO_GLYPH_EDIT_TIMES_KEY)
    )
  )
}

export const refreshGitCollaboration = async (
  ctx: GitHubCommitFlowContext,
  nextProjectId: string
): Promise<GitCollaborationState> => {
  const project = await loadKumikoProjectRecord(nextProjectId)
  const nextCollaboration = collaborationStateFromProjectRecord(project)
  ctx.setGitCollaboration(nextCollaboration)
  return nextCollaboration
}

export const switchGitBranch = async (
  ctx: GitHubCommitFlowContext,
  input: {
    projectId: string | null
    target: { repo: string; branch: string }
    isSwitchingGitBranch: boolean
    setIsSwitchingGitBranch: (value: boolean) => void
    store: ProjectStateLoaders
  }
) => {
  const { projectId, target } = input
  if (
    !projectId ||
    !target.repo ||
    !target.branch.trim() ||
    input.isSwitchingGitBranch
  ) {
    return
  }
  try {
    input.setIsSwitchingGitBranch(true)
    const { switchGitProjectBranchInWorker } =
      await import('@/lib/git/gitSyncWorkerClient')
    await switchGitProjectBranchInWorker({
      projectId,
      repo: target.repo,
      branch: target.branch.trim(),
    })
    await reloadProjectFromPersistence(input.store, projectId)
    await refreshGitCollaboration(ctx, projectId)
    ctx.updateGitHubCommitDraft({
      branchName: target.branch.trim(),
      isCreatingNewBranch: false,
    })
    if (target.repo === ctx.githubForkStatus?.targetRepo?.fullName) {
      await refreshGitHubCompareStatus(ctx, target.branch)
    }
    void ctx.queryClient.invalidateQueries({
      queryKey: githubSyncReportQueryKey(projectId),
    })
    toaster.create({
      title: ctx.t('glyphInspector.toast.switchSuccessTitle'),
      description: ctx.t('glyphInspector.toast.switchSuccessDescription', {
        branch: target.branch,
      }),
      type: 'success',
      duration: 3200,
      closable: true,
    })
  } catch (error) {
    toaster.create({
      title: ctx.t('glyphInspector.toast.switchFailedTitle'),
      description: getErrorMessage(
        error,
        ctx.t('glyphInspector.toast.switchFailedDescription')
      ),
      type: 'error',
      duration: 4200,
      closable: true,
    })
  } finally {
    input.setIsSwitchingGitBranch(false)
  }
}

export const loginGitHub = async (
  ctx: GitHubCommitFlowContext,
  input: {
    login: () => Promise<GitHubViewer>
    gitHubBranchName: string
  }
) => {
  try {
    const viewer = await input.login()
    if (ctx.githubRepoFullName) {
      await loadGitHubForkStatus(
        ctx,
        input.gitHubBranchName.trim() || undefined,
        {
          // A fork-status response defaults to its default branch. In git mode
          // that is the merge base, not an implicit destination for a change.
          syncDraftSelection: Boolean(input.gitHubBranchName.trim()),
        }
      )
    }
    toaster.create({
      title: ctx.t('glyphInspector.toast.loginSuccessTitle'),
      description: ctx.t('glyphInspector.toast.loginSuccessDescription', {
        login: viewer.login,
      }),
      type: 'success',
      duration: 2600,
      closable: true,
    })
  } catch (error) {
    toaster.create({
      title: ctx.t('glyphInspector.toast.loginFailedTitle'),
      description: getErrorMessage(
        error,
        ctx.t('glyphInspector.toast.loginFailedDescription')
      ),
      type: 'error',
      duration: 3200,
      closable: true,
    })
  }
}

export const logoutGitHub = async (
  ctx: GitHubCommitFlowContext,
  input: { logout: () => Promise<unknown>; isPending: boolean }
) => {
  if (input.isPending) {
    return
  }

  try {
    await input.logout()
    ctx.setForkStatusOverride(null)
    toaster.create({
      title: ctx.t('glyphInspector.toast.logoutSuccessTitle'),
      description: ctx.t('glyphInspector.toast.logoutSuccessDescription'),
      type: 'success',
      duration: 2200,
      closable: true,
    })
  } catch (error) {
    toaster.create({
      title: ctx.t('glyphInspector.toast.logoutFailedTitle'),
      description: getErrorMessage(
        error,
        ctx.t('glyphInspector.toast.logoutFailedDescription')
      ),
      type: 'error',
      duration: 3200,
      closable: true,
    })
  }
}

// Runs after the modal is already open: loads the collaboration state and fork
// status, then flushes the draft and restores the branch selection.
export const prepareGitHubCommitModal = async (
  ctx: GitHubCommitFlowContext,
  input: {
    projectId: string
    gitHubBranchName: string
    githubViewer: GitHubViewer | null
    canCommitToGitHub: boolean
    persistenceStatus: GlobalState['persistenceStatus']
    localDirtyGlyphIds: string[]
    setIsPreparingGitHubCommit: (value: boolean) => void
    flushDraft: () => Promise<unknown>
  }
) => {
  const collaboration = await refreshGitCollaboration(ctx, input.projectId)
  const selectedBranch = input.gitHubBranchName.trim()
  const activeBranch = collaboration?.activeTarget?.ref ?? ''
  const forkStatus = input.githubViewer
    ? await loadGitHubForkStatus(
        ctx,
        selectedBranch || activeBranch || undefined,
        {
          // Do not let fork-status turn a new contribution into a commit to
          // the fork's default branch. An explicit draft or active submitted
          // draft is restored below instead.
          syncDraftSelection: Boolean(selectedBranch),
        }
      )
    : null

  if (!input.canCommitToGitHub || input.persistenceStatus === 'error') {
    return
  }

  try {
    input.setIsPreparingGitHubCommit(true)
    await input.flushDraft()

    // The message field stays as the user left it: prefilling it here would
    // both discard a typed message and hide the receipt-derived suggestion,
    // which only ever shows as the placeholder of an empty field.
    ctx.updateGitHubCommitDraft(
      resolveOpenModalDraftUpdate({
        selectedBranch,
        collaboration,
        forkStatus,
        localDirtyGlyphIds: input.localDirtyGlyphIds,
      })
    )
  } catch (error) {
    toaster.create({
      title: ctx.t('glyphInspector.toast.prepareFailedTitle'),
      description: getErrorMessage(
        error,
        ctx.t('glyphInspector.toast.prepareFailedDescription')
      ),
      type: 'error',
      duration: 3200,
      closable: true,
    })
  } finally {
    input.setIsPreparingGitHubCommit(false)
  }
}

export const createGitHubFork = async (
  ctx: GitHubCommitFlowContext,
  input: {
    createFork: (repoFullName: string) => Promise<GitHubForkStatus>
    isPending: boolean
  }
) => {
  const { githubRepoFullName } = ctx
  if (!githubRepoFullName || input.isPending) {
    return
  }

  try {
    const result = await input.createFork(githubRepoFullName)
    ctx.setForkStatusOverride(result)
    toaster.create({
      title: ctx.t('glyphInspector.toast.forkCreatedTitle'),
      description: result.targetRepo?.fullName ?? githubRepoFullName,
      type: 'success',
      duration: 3200,
      closable: true,
    })
  } catch (error) {
    toaster.create({
      title: ctx.t('glyphInspector.toast.forkCreateFailedTitle'),
      description: getErrorMessage(
        error,
        ctx.t('glyphInspector.toast.forkCreateFailedDescription')
      ),
      type: 'error',
      duration: 3600,
      closable: true,
    })
  }
}

export const createGitHubCommit = async (
  ctx: GitHubCommitFlowContext,
  input: {
    projectId: string
    projectTitle: string
    gitHubBranchName: string
    gitHubCommitMessage: string
    suggestedCommitMessage: string
    githubViewer: GitHubViewer | null
    persistenceStatus: GlobalState['persistenceStatus']
    isCommittingToGitHub: boolean
    hasBlockingSyncConflicts: boolean
    hasBlockingQualityIssues: boolean
    changeReceipt: ChangeReceipt
    voidedLineKeys: string[]
    flushDraft: () => Promise<unknown>
    markDraftSaved: () => void
    markLocalSaved: () => void
    setIsCommittingToGitHub: (value: boolean) => void
    setSubmitErrorMessage: (message: string | null) => void
    setLastSubmitResult: (result: GitHubSubmitResult | null) => void
    setVoidedLineKeys: (keys: string[]) => void
    loginGitHub: () => Promise<void>
  }
) => {
  const { t, queryClient, githubForkStatus } = ctx
  const { projectId } = input

  if (!input.gitHubBranchName.trim()) {
    toaster.create({
      title: t('glyphInspector.toast.draftUnavailableTitle'),
      description: t('glyphInspector.toast.draftUnavailableDescription'),
      type: 'warning',
      duration: 2800,
      closable: true,
    })
    return
  }

  if (input.hasBlockingSyncConflicts) {
    toaster.create({
      title: t('glyphInspector.toast.syncConflictsTitle'),
      description: t('glyphInspector.toast.syncConflictsDescription'),
      type: 'warning',
      duration: 3600,
      closable: true,
    })
    return
  }

  if (input.hasBlockingQualityIssues) {
    toaster.create({
      title: t('qualityCheck.commit.blockingToastTitle'),
      description: t('qualityCheck.commit.blockingToastDescription'),
      type: 'warning',
      duration: 3600,
      closable: true,
    })
    return
  }

  if (input.persistenceStatus === 'error' || input.isCommittingToGitHub) {
    return
  }

  const commitAuthor = gitCommitAuthorForGitHubViewer(input.githubViewer)
  if (!commitAuthor) {
    toaster.create({
      title: t('glyphInspector.toast.loginRequiredTitle'),
      description: t('glyphInspector.toast.loginRequiredDescription'),
      type: 'warning',
      duration: 3200,
      closable: true,
    })
    return
  }

  try {
    input.setIsCommittingToGitHub(true)
    input.setSubmitErrorMessage(null)
    input.setLastSubmitResult(null)
    await input.flushDraft()

    const result = await commitThroughGit({
      projectId,
      projectTitle: input.projectTitle,
      branchName: input.gitHubBranchName.trim(),
      commitMessage:
        input.gitHubCommitMessage.trim() || input.suggestedCommitMessage,
      forkStatus: githubForkStatus,
      author: commitAuthor,
      ...resolveReceiptExclusions({
        receipt: input.changeReceipt,
        voidedKeys: input.voidedLineKeys,
      }),
    })
    input.markDraftSaved()
    input.markLocalSaved()
    void queryClient.invalidateQueries({
      queryKey: githubSyncReportQueryKey(projectId),
    })
    void queryClient.invalidateQueries({
      queryKey: projectSyncDirtyStatusQueryKey(projectId),
    })
    if (githubForkStatus) {
      ctx.setForkStatusOverride(
        setForkStatusQueryData(
          queryClient,
          githubForkStatus,
          buildForkStatusPatchAfterCommit(githubForkStatus, result)
        )
      )
    }
    ctx.updateGitHubCommitDraft({
      branchName: result.branchName,
      isCreatingNewBranch: false,
    })
    await refreshGitCollaboration(ctx, projectId)
    input.setLastSubmitResult(toGitHubSubmitResult(result))
    input.setVoidedLineKeys([])
    toaster.create({
      title: t('glyphInspector.toast.commitSentTitle'),
      description: t('glyphInspector.toast.commitSentDescription'),
      type: 'success',
      duration: 3600,
      closable: true,
    })
  } catch (error) {
    const message = getErrorMessage(
      error,
      t('glyphInspector.toast.commitFailedDescription')
    )
    input.setSubmitErrorMessage(message)

    if (isMissingGitHubTokenError(message)) {
      toaster.create({
        title: t('glyphInspector.toast.loginRequiredTitle'),
        description: t('glyphInspector.toast.loginRequiredDescription'),
        type: 'warning',
        duration: 3200,
        closable: true,
      })
      void input.loginGitHub()
      return
    }

    toaster.create({
      title: t('glyphInspector.toast.commitFailedTitle'),
      description: message,
      type: 'error',
      duration: 4200,
      closable: true,
    })
    console.warn('GitHub commit failed.', error)
  } finally {
    input.setIsCommittingToGitHub(false)
  }
}

export const mergeGitHubUpstream = async (
  ctx: GitHubCommitFlowContext,
  input: {
    gitHubBranchName: string
    isPending: boolean
    mergeUpstream: (variables: {
      repo: string
      branchName: string
    }) => Promise<{ branchName: string; message: string }>
  }
) => {
  const { githubRepoFullName, t } = ctx
  if (!githubRepoFullName || !input.gitHubBranchName.trim()) {
    return
  }

  if (input.isPending) {
    return
  }

  try {
    const result = await input.mergeUpstream({
      repo: githubRepoFullName,
      branchName: input.gitHubBranchName.trim(),
    })
    await refreshGitHubCompareStatus(ctx, result.branchName)
    toaster.create({
      title: t('glyphInspector.toast.mergeSuccessTitle'),
      description: result.message,
      type: 'success',
      duration: 3600,
      closable: true,
    })
  } catch (error) {
    toaster.create({
      title: t('glyphInspector.toast.mergeFailedTitle'),
      description: getErrorMessage(
        error,
        t('glyphInspector.toast.mergeFailedDescription')
      ),
      type: 'error',
      duration: 4200,
      closable: true,
    })
  }
}
