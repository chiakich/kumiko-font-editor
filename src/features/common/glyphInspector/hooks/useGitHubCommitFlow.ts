import { useDisclosure } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  startGitHubOAuthLogin,
  type GitHubForkStatus,
} from '@/lib/github/githubAuth'
import {
  useCreateGitHubForkMutation,
  useGitHubForkStatusQuery,
  useGitHubViewerQuery,
  useLoginGitHubMutation,
  useLogoutGitHubMutation,
  useMergeGitHubUpstreamMutation,
} from '@/lib/github/githubQueries'
import { buildCurrentDraftFlushInput } from '@/store/currentDraftFlush'
import { flushPendingDraft } from '@/lib/project/flushPendingDraft'
import type { FontData } from '@/domain'
import { useStore } from '@/store'
import type { GlyphEditTimes } from '@/lib/glyph/glyphEditTimes'
import {
  buildSuggestedGitHubBranchName,
  getErrorMessage,
} from '@/features/common/glyphInspector/utils/githubCommitFlowUtils'
import type {
  GitHubCommitModalProps,
  GitHubSubmitResult,
} from '@/features/common/glyphInspector/components/GitHubCommitModal'
import {
  buildChangeReceipt,
  collectSentGlyphChanges,
} from '@/features/common/glyphInspector/utils/changeReceipt'
import { useGitHubSyncStatus } from '@/features/common/glyphInspector/hooks/useGitHubSyncStatus'
import { buildGlyphCommitMessage } from '@/lib/github/sync/commitMessage'
import { useGitSyncPrewarm } from '@/features/common/glyphInspector/hooks/useGitSyncPrewarm'
import { useTranslation } from 'react-i18next'
import {
  createEmptyCommitDraft,
  mergeCommitDraft,
  resolveActiveCommitDraft,
  resolveForkStatusOverride,
  resolveVoidedLineKeys,
  toggleVoidedLineKey,
  type GitCollaborationState,
  type GitHubCommitDraftUpdate,
  type ScopedForkStatusOverride,
  type ScopedGitHubCommitDraft,
  type ScopedVoidedLines,
} from '@/features/common/glyphInspector/utils/gitHubCommitFlowState'
import {
  createGitHubCommit,
  createGitHubFork,
  loginGitHub,
  logoutGitHub,
  mergeGitHubUpstream,
  prepareGitHubCommitModal,
  switchGitBranch,
  type GitHubCommitFlowContext,
} from '@/features/common/glyphInspector/utils/gitHubCommitFlowActions'

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
  const [voidedLines, setVoidedLines] = useState<ScopedVoidedLines>({
    repoFullName: null,
    keys: [],
  })
  // Memoized so the empty fallback keeps a stable identity: it feeds the
  // suggested-message memo below.
  const voidedLineKeys = useMemo(
    () => resolveVoidedLineKeys(voidedLines, githubRepoFullName),
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
  const activeCommitDraft = resolveActiveCommitDraft(
    gitHubCommitDraft,
    githubRepoFullName
  )
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
  const updateGitHubCommitDraft = (update: GitHubCommitDraftUpdate) => {
    setGitHubCommitDraft((current) =>
      mergeCommitDraft(current, githubRepoFullName, update)
    )
  }
  const forkStatusOverride = resolveForkStatusOverride(
    forkStatusOverrideState,
    githubRepoFullName,
    hasGitHubSource
  )
  const setForkStatusOverride = (forkStatus: GitHubForkStatus | null) => {
    setForkStatusOverrideState({
      repoFullName: githubRepoFullName,
      forkStatus,
    })
  }
  const queryClient = useQueryClient()
  const viewerQuery = useGitHubViewerQuery(hasGitHubSource)
  const githubViewer = viewerQuery.data ?? null
  // Warm the git stack (chunk, worker, packfile clone, fork status) in the
  // background so the first send-panel open does not pay for all of it.
  useGitSyncPrewarm({
    projectId,
    repoFullName: githubRepoFullName,
    enabled: hasGitHubSource && Boolean(githubViewer),
  })
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

  const flowContext: GitHubCommitFlowContext = {
    t,
    queryClient,
    githubRepoFullName,
    githubForkStatus,
    setForkStatusOverride,
    updateGitHubCommitDraft,
    setGitCollaboration,
  }

  const flushDraft = (input: {
    projectId: string
    fontData: FontData
    layerId: string | null
  }) =>
    flushPendingDraft(
      buildCurrentDraftFlushInput({
        activeMasterId,
        deletedGlyphIds: localDeletedGlyphIds,
        dirtyGlyphIds: localDirtyGlyphIds,
        editLocation,
        fontData: input.fontData,
        glyphEditTimes,
        markDraftSaved,
        overviewGridState,
        overviewSectionId,
        overviewTopGlyphId,
        persistenceQueue,
        projectId: input.projectId,
        projectTitle,
        selectedGlyphId,
        selectedLayerId: input.layerId,
        setPersistenceStatus,
      })
    )

  const handleSwitchGitBranch = (target: { repo: string; branch: string }) =>
    switchGitBranch(flowContext, {
      projectId,
      target,
      isSwitchingGitBranch,
      setIsSwitchingGitBranch,
      store: { loadProjectState, hydratePersistedLocalChanges },
    })

  const handleLoginGitHub = () =>
    loginGitHub(flowContext, {
      login: () => loginMutation.mutateAsync(startGitHubOAuthLogin),
      gitHubBranchName,
    })

  const handleLogoutGitHub = () =>
    logoutGitHub(flowContext, {
      logout: () => logoutMutation.mutateAsync(),
      isPending: logoutMutation.isPending,
    })

  const handleOpenGitHubModal = async () => {
    gitHubModal.onOpen()
    setSubmitErrorMessage(null)
    setLastSubmitResult(null)
    setVoidedLineKeys([])

    if (!fontData || !projectId || !projectTitle) {
      return
    }

    await prepareGitHubCommitModal(flowContext, {
      projectId,
      gitHubBranchName,
      githubViewer,
      canCommitToGitHub,
      persistenceStatus,
      localDirtyGlyphIds,
      setIsPreparingGitHubCommit,
      flushDraft: () =>
        flushDraft({ projectId, fontData, layerId: selectedLayerId }),
    })
  }

  const handleCreateFork = () =>
    createGitHubFork(flowContext, {
      createFork: (repoFullName) =>
        createForkMutation.mutateAsync(repoFullName),
      isPending: createForkMutation.isPending,
    })

  const handleCreateGitHubCommit = async () => {
    if (!fontData || !projectId || !projectTitle || isCommittingToGitHub) {
      return
    }

    const activeLayerId = selectedLayerId ?? 'public.default'

    await createGitHubCommit(flowContext, {
      projectId,
      projectTitle,
      gitHubBranchName,
      gitHubCommitMessage,
      suggestedCommitMessage,
      githubViewer,
      persistenceStatus,
      isCommittingToGitHub,
      hasBlockingSyncConflicts,
      hasBlockingQualityIssues,
      changeReceipt,
      voidedLineKeys,
      flushDraft: () =>
        flushDraft({ projectId, fontData, layerId: activeLayerId }),
      markDraftSaved,
      markLocalSaved,
      setIsCommittingToGitHub,
      setSubmitErrorMessage,
      setLastSubmitResult,
      setVoidedLineKeys,
      loginGitHub: handleLoginGitHub,
    })
  }

  const handleMergeGitHubUpstream = () =>
    mergeGitHubUpstream(flowContext, {
      gitHubBranchName,
      isPending: mergeUpstreamMutation.isPending,
      mergeUpstream: (variables) =>
        mergeUpstreamMutation.mutateAsync(variables),
    })

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
      setVoidedLineKeys(toggleVoidedLineKey(voidedLineKeys, key)),
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
