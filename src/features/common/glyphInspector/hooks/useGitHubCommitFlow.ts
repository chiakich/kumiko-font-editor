import { toaster } from '@/components/ui/toaster'
import { useDisclosure } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  gitCommitAuthorForGitHubViewer,
  startGitHubOAuthLogin,
  type GitHubForkStatus,
} from 'src/lib/github/githubAuth'
import {
  applyCompareToForkStatus,
  fetchCachedGitHubCompareStatus,
  fetchCachedGitHubForkStatus,
  setForkStatusQueryData,
  useCreateGitHubForkMutation,
  useGitHubForkStatusQuery,
  useGitHubViewerQuery,
  useLoginGitHubMutation,
  useLogoutGitHubMutation,
  useMergeGitHubUpstreamMutation,
} from 'src/lib/github/githubQueries'
import { buildCurrentDraftFlushInput } from 'src/lib/project/currentDraftFlush'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { useStore, type FontData } from 'src/store'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import {
  buildSuggestedGitHubBranchName,
  getErrorMessage,
  isExistingGitHubBranch,
  isMissingGitHubTokenError,
  resolveGitHubBranchSelection,
} from 'src/features/common/glyphInspector/utils/githubCommitFlowUtils'
import type {
  GitHubCommitModalProps,
  GitHubSubmitResult,
} from 'src/features/common/glyphInspector/components/GitHubCommitModal'
import {
  buildChangeReceipt,
  collectSentGlyphChanges,
  resolveReceiptExclusions,
} from 'src/features/common/glyphInspector/utils/changeReceipt'
import {
  githubSyncReportQueryKey,
  useGitHubSyncStatus,
} from 'src/features/common/glyphInspector/hooks/useGitHubSyncStatus'
import { buildGlyphCommitMessage } from 'src/lib/github/sync/commitMessage'
import { projectSyncDirtyStatusQueryKey } from 'src/features/common/glyphInspector/hooks/useProjectSyncDirtyStatus'
import { commitThroughGit } from 'src/features/common/glyphInspector/utils/gitCommitSubmission'
import { useTranslation } from 'react-i18next'
import {
  listSyncDirtyKumikoGlyphIds,
  loadKumikoProjectRecord,
  loadKumikoUiValue,
} from 'src/lib/project/kumikoProjectPersistence'
import { loadProjectDraftMetadata } from 'src/lib/project/projectRepository'
import {
  sanitizeGlyphEditTimes,
  UFO_GLYPH_EDIT_TIMES_KEY,
} from 'src/lib/glyph/glyphEditTimes'
import type { GitHubSyncTarget } from 'src/lib/github/sync/types'

interface UseGitHubCommitFlowInput {
  projectId: string | null
  projectTitle: string
  fontData: FontData | null
  selectedLayerId: string | null
  hasGitHubSource: boolean
  githubRepoFullName: string | null
  canCommitToGitHub: boolean
  hasBlockingQualityIssues: boolean
  localDirtyGlyphIds: string[]
  localDeletedGlyphIds: string[]
  glyphEditTimes: GlyphEditTimes
  markDraftSaved: (
    savedDirtyIds?: string[],
    savedDeletedIds?: string[],
    savedRevision?: number
  ) => void
}

interface ScopedForkStatusOverride {
  repoFullName: string | null
  forkStatus: GitHubForkStatus | null
}

interface ScopedGitHubCommitDraft {
  repoFullName: string | null
  commitMessage: string
  branchName: string
  isCreatingNewBranch: boolean
}

interface GitCollaborationState {
  activeTarget: GitHubSyncTarget | null
  changeDrafts: GitHubSyncTarget[]
}

const createEmptyCommitDraft = (
  repoFullName: string | null
): ScopedGitHubCommitDraft => ({
  repoFullName,
  commitMessage: '',
  branchName: '',
  isCreatingNewBranch: false,
})

export const useGitHubCommitFlow = ({
  projectId,
  projectTitle,
  fontData,
  selectedLayerId,
  hasGitHubSource,
  githubRepoFullName,
  canCommitToGitHub,
  hasBlockingQualityIssues,
  localDirtyGlyphIds,
  localDeletedGlyphIds,
  glyphEditTimes,
  markDraftSaved,
}: UseGitHubCommitFlowInput) => {
  const { t } = useTranslation()
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const persistenceStatus = useStore((state) => state.persistenceStatus)
  const persistenceQueue = useStore((state) => state.persistenceQueue)
  const markLocalSaved = useStore((state) => state.markLocalSaved)
  const loadProjectState = useStore((state) => state.loadProjectState)
  const hydratePersistedLocalChanges = useStore(
    (state) => state.hydratePersistedLocalChanges
  )
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const editLocation = useStore((state) => state.editLocation)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const gitHubModal = useDisclosure()
  const [isPreparingGitHubCommit, setIsPreparingGitHubCommit] = useState(false)
  // The git transport does not go through a mutation, so its pending state has
  // to be tracked here or the button stays idle for the whole push.
  const [isCommittingToGitHub, setIsCommittingToGitHub] = useState(false)
  const [isSwitchingGitBranch, setIsSwitchingGitBranch] = useState(false)
  // A failed push has to stay on screen: a toast that flies away is the wrong
  // place for "nothing was changed, here is git's reason".
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(
    null
  )
  const [lastSubmitResult, setLastSubmitResult] =
    useState<GitHubSubmitResult | null>(null)
  // Scoped like the commit draft: receipt keys fall back to bare glyph ids, so
  // an unscoped set would strike out a same-named glyph in another project.
  const [voidedLines, setVoidedLines] = useState<{
    repoFullName: string | null
    keys: string[]
  }>({ repoFullName: null, keys: [] })
  // Memoized so the empty fallback keeps a stable identity: it feeds the
  // suggested-message memo below.
  const voidedLineKeys = useMemo(
    () =>
      voidedLines.repoFullName === githubRepoFullName ? voidedLines.keys : [],
    [githubRepoFullName, voidedLines]
  )
  const setVoidedLineKeys = (keys: string[]) =>
    setVoidedLines({ repoFullName: githubRepoFullName, keys })
  const [gitCollaboration, setGitCollaboration] =
    useState<GitCollaborationState>({
      activeTarget: null,
      changeDrafts: [],
    })
  const [hasBlockingSyncConflicts, setHasBlockingSyncConflicts] =
    useState(false)
  const [forkStatusOverrideState, setForkStatusOverrideState] =
    useState<ScopedForkStatusOverride>({
      repoFullName: null,
      forkStatus: null,
    })
  const [gitHubCommitDraft, setGitHubCommitDraft] =
    useState<ScopedGitHubCommitDraft>(() => createEmptyCommitDraft(null))
  const activeCommitDraft =
    gitHubCommitDraft.repoFullName === githubRepoFullName
      ? gitHubCommitDraft
      : createEmptyCommitDraft(githubRepoFullName)
  const gitHubCommitMessage = activeCommitDraft.commitMessage
  // Shares the report the modal already renders (same query key, so no extra
  // fetch): it is the transport-agnostic answer to "is this glyph new upstream".
  const syncStatus = useGitHubSyncStatus({
    projectId,
    enabled: gitHubModal.open && hasGitHubSource,
  })
  const syncReport = syncStatus.report
  // Struck-out lines are excluded, so the suggestion describes the send rather
  // than the whole local diff.
  const suggestedCommitMessage = useMemo(
    () =>
      buildGlyphCommitMessage({
        ...collectSentGlyphChanges({
          report: syncReport,
          fontData,
          voidedKeys: voidedLineKeys,
        }),
        fallbackTitle: projectTitle,
      }),
    [fontData, projectTitle, syncReport, voidedLineKeys]
  )
  const gitHubBranchName = activeCommitDraft.branchName
  const updateGitHubCommitDraft = (
    update: Partial<Omit<ScopedGitHubCommitDraft, 'repoFullName'>>
  ) => {
    setGitHubCommitDraft((current) => ({
      ...(current.repoFullName === githubRepoFullName
        ? current
        : createEmptyCommitDraft(githubRepoFullName)),
      ...update,
    }))
  }
  const forkStatusOverride =
    hasGitHubSource &&
    forkStatusOverrideState.repoFullName === githubRepoFullName
      ? forkStatusOverrideState.forkStatus
      : null
  const setForkStatusOverride = (forkStatus: GitHubForkStatus | null) => {
    setForkStatusOverrideState({
      repoFullName: githubRepoFullName,
      forkStatus,
    })
  }
  const queryClient = useQueryClient()
  const viewerQuery = useGitHubViewerQuery(hasGitHubSource)
  const githubViewer = viewerQuery.data ?? null
  const forkStatusQuery = useGitHubForkStatusQuery({
    repo: githubRepoFullName,
    branch: null,
    enabled:
      gitHubModal.open &&
      Boolean(githubViewer && githubRepoFullName) &&
      !forkStatusOverride,
  })
  const loginMutation = useLoginGitHubMutation()
  const logoutMutation = useLogoutGitHubMutation()
  const createForkMutation = useCreateGitHubForkMutation()
  const mergeUpstreamMutation = useMergeGitHubUpstreamMutation()
  const githubForkStatus = forkStatusOverride ?? forkStatusQuery.data ?? null
  const loadGitHubForkStatus = async (
    branchName?: string,
    options: { syncDraftSelection?: boolean } = {}
  ) => {
    if (!githubRepoFullName) {
      return null
    }

    try {
      const forkStatus = await fetchCachedGitHubForkStatus(queryClient, {
        repo: githubRepoFullName,
        branch: branchName,
      })
      setForkStatusOverride(forkStatus)
      const resolvedBranch = resolveGitHubBranchSelection(
        forkStatus,
        branchName
      )
      if (resolvedBranch && options.syncDraftSelection !== false) {
        updateGitHubCommitDraft({
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
        t('glyphInspector.toast.forkStatusFailedDescription')
      )

      if (isMissingGitHubTokenError(message)) {
        setForkStatusOverride(null)
        return null
      }

      toaster.create({
        title: t('glyphInspector.toast.forkStatusFailedTitle'),
        description: message,
        type: 'error',
        duration: 3600,
        closable: true,
      })
      return null
    }
  }

  const refreshGitHubCompareStatus = async (branchName: string) => {
    if (!githubForkStatus?.targetRepo || !branchName.trim()) {
      return
    }

    const selectedBranch = branchName.trim()
    const compareStatus = await fetchCachedGitHubCompareStatus(queryClient, {
      repo: githubForkStatus.sourceRepo.fullName,
      headOwner: githubForkStatus.targetRepo.owner,
      headBranch: selectedBranch,
    })

    setForkStatusOverride(
      setForkStatusQueryData(
        queryClient,
        applyCompareToForkStatus(
          githubForkStatus,
          compareStatus,
          selectedBranch
        )
      )
    )
  }

  const reloadProjectFromPersistence = async (nextProjectId: string) => {
    const loadedProject = await loadProjectDraftMetadata(nextProjectId)
    if (!loadedProject) {
      return
    }
    loadProjectState(
      loadedProject.id,
      loadedProject.title,
      loadedProject.fontData!,
      loadedProject.projectMetadata,
      loadedProject.projectSourceFormat ?? null,
      loadedProject.projectRoundTripFormat ?? null,
      loadedProject.projectUiState
    )
    hydratePersistedLocalChanges(
      await listSyncDirtyKumikoGlyphIds(nextProjectId),
      [],
      sanitizeGlyphEditTimes(
        await loadKumikoUiValue(nextProjectId, UFO_GLYPH_EDIT_TIMES_KEY)
      )
    )
  }

  const refreshGitCollaboration = async (
    nextProjectId: string
  ): Promise<GitCollaborationState> => {
    const project = await loadKumikoProjectRecord(nextProjectId)
    const nextCollaboration = {
      activeTarget: project?.sourceData?.ufo?.lastSync ?? null,
      changeDrafts:
        project?.sourceData?.ufo?.gitCollaboration?.changeDrafts ?? [],
    }
    setGitCollaboration(nextCollaboration)
    return nextCollaboration
  }

  const handleSwitchGitBranch = async (target: {
    repo: string
    branch: string
  }) => {
    if (
      !projectId ||
      !target.repo ||
      !target.branch.trim() ||
      isSwitchingGitBranch
    ) {
      return
    }
    try {
      setIsSwitchingGitBranch(true)
      const { switchGitProjectBranchInWorker } =
        await import('src/lib/git/gitSyncWorkerClient')
      await switchGitProjectBranchInWorker({
        projectId,
        repo: target.repo,
        branch: target.branch.trim(),
      })
      await reloadProjectFromPersistence(projectId)
      await refreshGitCollaboration(projectId)
      updateGitHubCommitDraft({
        branchName: target.branch.trim(),
        isCreatingNewBranch: false,
      })
      if (target.repo === githubForkStatus?.targetRepo?.fullName) {
        await refreshGitHubCompareStatus(target.branch)
      }
      void queryClient.invalidateQueries({
        queryKey: githubSyncReportQueryKey(projectId),
      })
      toaster.create({
        title: t('glyphInspector.toast.switchSuccessTitle'),
        description: t('glyphInspector.toast.switchSuccessDescription', {
          branch: target.branch,
        }),
        type: 'success',
        duration: 3200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: t('glyphInspector.toast.switchFailedTitle'),
        description: getErrorMessage(
          error,
          t('glyphInspector.toast.switchFailedDescription')
        ),
        type: 'error',
        duration: 4200,
        closable: true,
      })
    } finally {
      setIsSwitchingGitBranch(false)
    }
  }

  const handleLoginGitHub = async () => {
    try {
      const viewer = await loginMutation.mutateAsync(startGitHubOAuthLogin)
      if (githubRepoFullName) {
        await loadGitHubForkStatus(gitHubBranchName.trim() || undefined, {
          // A fork-status response defaults to its default branch. In git mode
          // that is the merge base, not an implicit destination for a change.
          syncDraftSelection: Boolean(gitHubBranchName.trim()),
        })
      }
      toaster.create({
        title: t('glyphInspector.toast.loginSuccessTitle'),
        description: t('glyphInspector.toast.loginSuccessDescription', {
          login: viewer.login,
        }),
        type: 'success',
        duration: 2600,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: t('glyphInspector.toast.loginFailedTitle'),
        description: getErrorMessage(
          error,
          t('glyphInspector.toast.loginFailedDescription')
        ),
        type: 'error',
        duration: 3200,
        closable: true,
      })
    }
  }

  const handleLogoutGitHub = async () => {
    if (logoutMutation.isPending) {
      return
    }

    try {
      await logoutMutation.mutateAsync()
      setForkStatusOverride(null)
      toaster.create({
        title: t('glyphInspector.toast.logoutSuccessTitle'),
        description: t('glyphInspector.toast.logoutSuccessDescription'),
        type: 'success',
        duration: 2200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: t('glyphInspector.toast.logoutFailedTitle'),
        description: getErrorMessage(
          error,
          t('glyphInspector.toast.logoutFailedDescription')
        ),
        type: 'error',
        duration: 3200,
        closable: true,
      })
    }
  }

  const handleOpenGitHubModal = async () => {
    gitHubModal.onOpen()
    setSubmitErrorMessage(null)
    setLastSubmitResult(null)
    setVoidedLineKeys([])

    if (!fontData || !projectId || !projectTitle) {
      return
    }

    const collaboration = await refreshGitCollaboration(projectId)
    const selectedBranch = gitHubBranchName.trim()
    const activeBranch = collaboration?.activeTarget?.ref ?? ''
    const forkStatus = githubViewer
      ? await loadGitHubForkStatus(
          selectedBranch || activeBranch || undefined,
          {
            // Do not let fork-status turn a new contribution into a commit to
            // the fork's default branch. An explicit draft or active submitted
            // draft is restored below instead.
            syncDraftSelection: Boolean(selectedBranch),
          }
        )
      : null

    if (!canCommitToGitHub || persistenceStatus === 'error') {
      return
    }

    try {
      setIsPreparingGitHubCommit(true)
      await flushPendingDraft(
        buildCurrentDraftFlushInput({
          activeMasterId,
          deletedGlyphIds: localDeletedGlyphIds,
          dirtyGlyphIds: localDirtyGlyphIds,
          editLocation,
          fontData,
          glyphEditTimes,
          markDraftSaved,
          overviewGridState,
          overviewSectionId,
          overviewTopGlyphId,
          persistenceQueue,
          projectId,
          projectTitle,
          selectedGlyphId,
          selectedLayerId,
          setPersistenceStatus,
        })
      )

      // The message field stays as the user left it: prefilling it here would
      // both discard a typed message and hide the receipt-derived suggestion,
      // which only ever shows as the placeholder of an empty field.
      const nextDraft: Partial<Omit<ScopedGitHubCommitDraft, 'repoFullName'>> =
        {}
      if (!selectedBranch) {
        const activeTarget = collaboration.activeTarget
        const activeDraft = Boolean(
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
        nextDraft.branchName = activeDraft
          ? activeTarget!.ref
          : buildSuggestedGitHubBranchName(localDirtyGlyphIds)
        nextDraft.isCreatingNewBranch = !activeDraft
      }
      updateGitHubCommitDraft(nextDraft)
    } catch (error) {
      toaster.create({
        title: t('glyphInspector.toast.prepareFailedTitle'),
        description: getErrorMessage(
          error,
          t('glyphInspector.toast.prepareFailedDescription')
        ),
        type: 'error',
        duration: 3200,
        closable: true,
      })
    } finally {
      setIsPreparingGitHubCommit(false)
    }
  }

  const handleCreateFork = async () => {
    if (!githubRepoFullName || createForkMutation.isPending) {
      return
    }

    try {
      const result = await createForkMutation.mutateAsync(githubRepoFullName)
      setForkStatusOverride(result)
      toaster.create({
        title: t('glyphInspector.toast.forkCreatedTitle'),
        description: result.targetRepo?.fullName ?? githubRepoFullName,
        type: 'success',
        duration: 3200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: t('glyphInspector.toast.forkCreateFailedTitle'),
        description: getErrorMessage(
          error,
          t('glyphInspector.toast.forkCreateFailedDescription')
        ),
        type: 'error',
        duration: 3600,
        closable: true,
      })
    }
  }

  const handleCreateGitHubCommit = async () => {
    if (!fontData || !projectId || !projectTitle || isCommittingToGitHub) {
      return
    }

    const activeLayerId = selectedLayerId ?? 'public.default'

    if (!gitHubBranchName.trim()) {
      toaster.create({
        title: t('glyphInspector.toast.draftUnavailableTitle'),
        description: t('glyphInspector.toast.draftUnavailableDescription'),
        type: 'warning',
        duration: 2800,
        closable: true,
      })
      return
    }

    if (hasBlockingSyncConflicts) {
      toaster.create({
        title: t('glyphInspector.toast.syncConflictsTitle'),
        description: t('glyphInspector.toast.syncConflictsDescription'),
        type: 'warning',
        duration: 3600,
        closable: true,
      })
      return
    }

    if (hasBlockingQualityIssues) {
      toaster.create({
        title: t('qualityCheck.commit.blockingToastTitle'),
        description: t('qualityCheck.commit.blockingToastDescription'),
        type: 'warning',
        duration: 3600,
        closable: true,
      })
      return
    }

    if (persistenceStatus === 'error' || isCommittingToGitHub) {
      return
    }

    const commitAuthor = gitCommitAuthorForGitHubViewer(githubViewer)
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
      setIsCommittingToGitHub(true)
      setSubmitErrorMessage(null)
      setLastSubmitResult(null)
      await flushPendingDraft(
        buildCurrentDraftFlushInput({
          activeMasterId,
          deletedGlyphIds: localDeletedGlyphIds,
          dirtyGlyphIds: localDirtyGlyphIds,
          editLocation,
          fontData,
          glyphEditTimes,
          markDraftSaved,
          overviewGridState,
          overviewSectionId,
          overviewTopGlyphId,
          persistenceQueue,
          projectId,
          projectTitle,
          selectedGlyphId,
          selectedLayerId: activeLayerId,
          setPersistenceStatus,
        })
      )

      const result = await commitThroughGit({
        projectId,
        projectTitle,
        branchName: gitHubBranchName.trim(),
        commitMessage: gitHubCommitMessage.trim() || suggestedCommitMessage,
        forkStatus: githubForkStatus,
        author: commitAuthor,
        ...resolveReceiptExclusions({
          receipt: changeReceipt,
          voidedKeys: voidedLineKeys,
        }),
      })
      markDraftSaved()
      markLocalSaved()
      void queryClient.invalidateQueries({
        queryKey: githubSyncReportQueryKey(projectId),
      })
      void queryClient.invalidateQueries({
        queryKey: projectSyncDirtyStatusQueryKey(projectId),
      })
      if (githubForkStatus) {
        setForkStatusOverride(
          setForkStatusQueryData(queryClient, githubForkStatus, {
            selectedBranch: result.branchName,
            compare: result.compare,
            branches: githubForkStatus.branches.includes(result.branchName)
              ? githubForkStatus.branches
              : [result.branchName, ...githubForkStatus.branches],
          })
        )
      }
      updateGitHubCommitDraft({
        branchName: result.branchName,
        isCreatingNewBranch: false,
      })
      await refreshGitCollaboration(projectId)
      setLastSubmitResult({
        branch: result.branchName,
        commitSha: result.commitSha,
        compareUrl: result.compare?.compareUrl ?? null,
      })
      setVoidedLineKeys([])
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
      setSubmitErrorMessage(message)

      if (isMissingGitHubTokenError(message)) {
        toaster.create({
          title: t('glyphInspector.toast.loginRequiredTitle'),
          description: t('glyphInspector.toast.loginRequiredDescription'),
          type: 'warning',
          duration: 3200,
          closable: true,
        })
        void handleLoginGitHub()
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
      setIsCommittingToGitHub(false)
    }
  }

  const handleMergeGitHubUpstream = async () => {
    if (!githubRepoFullName || !gitHubBranchName.trim()) {
      return
    }

    if (mergeUpstreamMutation.isPending) {
      return
    }

    try {
      const result = await mergeUpstreamMutation.mutateAsync({
        repo: githubRepoFullName,
        branchName: gitHubBranchName.trim(),
      })
      await refreshGitHubCompareStatus(result.branchName)
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

  const changeReceipt = buildChangeReceipt({
    report: syncReport,
    fontData,
    dirtyGlyphIds: localDirtyGlyphIds,
    deletedGlyphIds: localDeletedGlyphIds,
  })

  const modalProps: GitHubCommitModalProps = {
    isOpen: gitHubModal.open,
    onClose: () => {
      setHasBlockingSyncConflicts(false)
      gitHubModal.onClose()
    },
    projectId,
    githubViewer,
    githubForkStatus,
    isLoggingOutGitHub: logoutMutation.isPending,
    isLoadingGitHubForkStatus: forkStatusQuery.isFetching,
    isCreatingGitHubFork: createForkMutation.isPending,
    isPreparingGitHubCommit,
    isCreatingGitHubCommit: isCommittingToGitHub,
    // Committing before the report lands would skip the conflict gate.
    isCheckingSyncStatus: syncStatus.isLoading,
    isMergingGitHubUpstream: mergeUpstreamMutation.isPending,
    canCommitToGitHub,
    gitHubCommitMessage,
    suggestedCommitMessage,
    gitHubBranchName,
    changeDrafts: gitCollaboration.changeDrafts,
    changeReceipt,
    voidedLineKeys,
    submitErrorMessage,
    forkStatusErrorMessage: forkStatusQuery.error
      ? getErrorMessage(
          forkStatusQuery.error,
          t('glyphInspector.toast.forkStatusFailedDescription')
        )
      : null,
    lastSubmitResult,
    baseSha: syncReport?.remoteHeadSha ?? null,
    onToggleVoidLine: (key) =>
      setVoidedLineKeys(
        voidedLineKeys.includes(key)
          ? voidedLineKeys.filter((entry) => entry !== key)
          : [...voidedLineKeys, key]
      ),
    onLoginGitHub: () => void handleLoginGitHub(),
    onLogoutGitHub: () => void handleLogoutGitHub(),
    onCreateFork: () => void handleCreateFork(),
    onCommitMessageChange: (commitMessage) =>
      updateGitHubCommitDraft({ commitMessage }),
    // Picking a draft chooses where this change is sent — it does not reload the
    // project. Switching what you edit lives in the project version menu.
    onSelectDraft: (ref) =>
      updateGitHubCommitDraft({
        branchName: ref,
        isCreatingNewBranch: false,
      }),
    onStartNewBranch: () => {
      updateGitHubCommitDraft({
        branchName: buildSuggestedGitHubBranchName(localDirtyGlyphIds),
        isCreatingNewBranch: true,
      })
    },
    onMergeUpstream: () => void handleMergeGitHubUpstream(),
    onCreateCommit: () => void handleCreateGitHubCommit(),
    isSyncEnabled: hasGitHubSource,
    onBlockingSyncConflictsChange: setHasBlockingSyncConflicts,
    hasBlockingSyncConflicts,
  }

  // Switching which version is open reloads the whole project, so it belongs to
  // the project chrome, not to the act of sending a change.
  const versionMenuProps = {
    activeTarget: gitCollaboration.activeTarget,
    changeDrafts: gitCollaboration.changeDrafts,
    forkStatus: githubForkStatus,
    isSwitching: isSwitchingGitBranch,
    onSwitchToDraft: (ref: string) => {
      if (githubForkStatus?.targetRepo) {
        void handleSwitchGitBranch({
          repo: githubForkStatus.targetRepo.fullName,
          branch: ref,
        })
      }
    },
    onSwitchToMergeTarget: () => {
      if (githubForkStatus?.sourceRepo) {
        void handleSwitchGitBranch({
          repo: githubForkStatus.sourceRepo.fullName,
          branch: githubForkStatus.sourceRepo.defaultBranch,
        })
      }
    },
  }

  return {
    openGitHubModal: handleOpenGitHubModal,
    modalProps,
    versionMenuProps,
    pendingChangeCount: changeReceipt.totalCount,
    conflictCount: changeReceipt.conflictCount,
    hasSubmitError: Boolean(submitErrorMessage),
    isSubmitting: isCommittingToGitHub,
  }
}
