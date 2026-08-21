import { toaster } from '@/components/ui/toaster'
import { useDisclosure } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  startGitHubOAuthLogin,
  type GitHubForkStatus,
} from 'src/lib/github/githubAuth'
import {
  applyCompareToForkStatus,
  fetchCachedGitHubCompareStatus,
  fetchCachedGitHubForkStatus,
  setForkStatusQueryData,
  useCreateGitHubCommitMutation,
  useCreateGitHubForkMutation,
  useGitHubForkStatusQuery,
  useGitHubViewerQuery,
  useLoginGitHubMutation,
  useLogoutGitHubMutation,
  useMergeGitHubUpstreamMutation,
} from 'src/lib/github/githubQueries'
import {
  markGitHubCommitSynced,
  prepareGitHubCommit,
} from 'src/lib/github/githubPr'
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
import type { GitHubCommitModalProps } from 'src/features/common/glyphInspector/components/GitHubCommitModal'
import {
  githubSyncReportQueryKey,
  useGitHubSyncStatus,
} from 'src/features/common/glyphInspector/hooks/useGitHubSyncStatus'
import { buildGlyphCommitMessage } from 'src/lib/github/sync/commitMessage'
import { projectSyncDirtyStatusQueryKey } from 'src/features/common/glyphInspector/hooks/useProjectSyncDirtyStatus'
import { loadGitSyncEnabled } from 'src/lib/preferences/appPreferences'
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
  const suggestedCommitMessage = useMemo(() => {
    const glyphOf = (glyphName: string) => ({
      glyphName,
      unicodes: fontData?.glyphs[glyphName]?.unicodes,
    })
    const localChanges = (syncReport?.localChanges ?? []).filter(
      (entry) => entry.kind === 'glyph' && entry.glyphName
    )
    return buildGlyphCommitMessage({
      added: localChanges
        .filter((entry) => entry.status !== 'localDeleted' && !entry.remoteSha)
        .map((entry) => glyphOf(entry.glyphName!)),
      updated: localChanges
        .filter((entry) => entry.status !== 'localDeleted' && entry.remoteSha)
        .map((entry) => glyphOf(entry.glyphName!)),
      deleted: localChanges
        .filter((entry) => entry.status === 'localDeleted')
        .map((entry) => glyphOf(entry.glyphName!)),
      fallbackTitle: projectTitle,
    })
  }, [fontData, projectTitle, syncReport])
  const gitHubBranchName = activeCommitDraft.branchName
  const isCreatingNewGitHubBranch = activeCommitDraft.isCreatingNewBranch
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
  const createCommitMutation = useCreateGitHubCommitMutation()
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
      const message = getErrorMessage(error, '目前無法讀取 GitHub fork 狀態。')

      if (isMissingGitHubTokenError(message)) {
        setForkStatusOverride(null)
        return null
      }

      toaster.create({
        title: '讀取 GitHub 狀態失敗',
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
      !loadGitSyncEnabled() ||
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
        title: '已切換目前檢視版本',
        description: `目前正在檢視 ${target.branch} 的內容。`,
        type: 'success',
        duration: 3200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: '無法切換版本',
        description: getErrorMessage(error, '目前無法切換 GitHub 版本。'),
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
          syncDraftSelection:
            !loadGitSyncEnabled() || Boolean(gitHubBranchName.trim()),
        })
      }
      toaster.create({
        title: 'GitHub 已登入',
        description: `目前登入帳號：${viewer.login}`,
        type: 'success',
        duration: 2600,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: 'GitHub 登入失敗',
        description: getErrorMessage(error, '目前無法完成 GitHub 登入。'),
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
        title: 'GitHub 已登出',
        description: '目前 session 已清除。',
        type: 'success',
        duration: 2200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: 'GitHub 登出失敗',
        description: getErrorMessage(error, '目前無法登出 GitHub。'),
        type: 'error',
        duration: 3200,
        closable: true,
      })
    }
  }

  const handleOpenGitHubModal = async () => {
    gitHubModal.onOpen()

    if (!fontData || !projectId || !projectTitle) {
      return
    }

    const gitSyncEnabled = loadGitSyncEnabled()
    const collaboration = gitSyncEnabled
      ? await refreshGitCollaboration(projectId)
      : null
    const selectedBranch = gitHubBranchName.trim()
    const activeBranch = collaboration?.activeTarget?.ref ?? ''
    const forkStatus = githubViewer
      ? await loadGitHubForkStatus(
          selectedBranch || activeBranch || undefined,
          {
            // Do not let fork-status turn a new contribution into a commit to
            // the fork's default branch. An explicit draft or active submitted
            // draft is restored below instead.
            syncDraftSelection: !gitSyncEnabled || Boolean(selectedBranch),
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

      if (gitSyncEnabled) {
        const nextDraft: Partial<
          Omit<ScopedGitHubCommitDraft, 'repoFullName'>
        > = {
          // The git worker materializes the actual files exactly once when it
          // commits. Preparing the legacy REST payload here used to serialize
          // and hash the same glyphs a second time just to fill this field.
          commitMessage: buildGlyphCommitMessage({
            fallbackTitle: projectTitle,
          }),
        }
        if (!selectedBranch) {
          const activeTarget = collaboration?.activeTarget
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
        return
      }

      const preparedCommit = await prepareGitHubCommit({
        projectId,
        projectTitle,
      })
      const nextDraft: Partial<Omit<ScopedGitHubCommitDraft, 'repoFullName'>> =
        {
          commitMessage: preparedCommit.request.commitMessage,
        }
      if (!gitHubBranchName.trim()) {
        // A fork's default branch is a copy of the merge target, not a place
        // for a contributor's edits. Start a named change draft instead; the
        // branch picker remains available under advanced options when needed.
        nextDraft.branchName =
          preparedCommit.request.branchName ??
          buildSuggestedGitHubBranchName(preparedCommit.changedGlyphNames)
        nextDraft.isCreatingNewBranch = true
      }
      updateGitHubCommitDraft(nextDraft)
    } catch (error) {
      toaster.create({
        title: '無法準備 GitHub commit',
        description: getErrorMessage(error, '目前沒有可提交到 GitHub 的變更。'),
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
      if (
        !loadGitSyncEnabled() &&
        !gitHubBranchName.trim() &&
        result.selectedBranch
      ) {
        updateGitHubCommitDraft({
          branchName: result.selectedBranch,
          isCreatingNewBranch: false,
        })
      }
      toaster.create({
        title: 'GitHub fork 已建立',
        description: result.targetRepo?.fullName ?? githubRepoFullName,
        type: 'success',
        duration: 3200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: '建立 fork 失敗',
        description: getErrorMessage(error, '目前無法建立 GitHub fork。'),
        type: 'error',
        duration: 3600,
        closable: true,
      })
    }
  }

  const handleCreateGitHubCommit = async () => {
    if (
      !fontData ||
      !projectId ||
      !projectTitle ||
      createCommitMutation.isPending
    ) {
      return
    }

    const activeLayerId = selectedLayerId ?? 'public.default'

    if (!gitHubBranchName.trim()) {
      toaster.create({
        title: '無法準備修改草稿',
        description: '請重新開啟送出修改視窗後再試一次。',
        type: 'warning',
        duration: 2800,
        closable: true,
      })
      return
    }

    if (hasBlockingSyncConflicts) {
      toaster.create({
        title: '有尚未處理的同步衝突',
        description:
          '請先在上方選擇每個衝突字符要保留哪個版本，再套用遠端更新。',
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

    try {
      setIsCommittingToGitHub(true)
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

      const commitThroughRest = async () => {
        const preparedCommit = await prepareGitHubCommit({
          projectId,
          projectTitle,
        })
        const restResult = await createCommitMutation.mutateAsync({
          ...preparedCommit.request,
          commitMessage: gitHubCommitMessage.trim() || suggestedCommitMessage,
          branchName: gitHubBranchName.trim(),
        })
        await markGitHubCommitSynced(preparedCommit.exportStateUpdates, {
          projectId,
          headOwner: restResult.headOwner,
          branchName: restResult.branchName,
          commitSha: restResult.commitSha,
          fontLevelBlobShas: preparedCommit.fontLevelBlobShas,
        })
        return restResult
      }

      const result = loadGitSyncEnabled()
        ? await commitThroughGit({
            projectId,
            projectTitle,
            branchName: gitHubBranchName.trim(),
            commitMessage: gitHubCommitMessage.trim() || suggestedCommitMessage,
            forkStatus: githubForkStatus,
          })
        : await commitThroughRest()
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
      if (loadGitSyncEnabled()) {
        await refreshGitCollaboration(projectId)
      }
      toaster.create({
        title: '修改已送出',
        description: '你的修改已送到 GitHub，現在可以等待合併或查看修改提案。',
        type: 'success',
        duration: 3600,
        closable: true,
      })
    } catch (error) {
      const message = getErrorMessage(error, '目前無法建立 GitHub commit。')

      if (isMissingGitHubTokenError(message)) {
        toaster.create({
          title: '需要 GitHub 登入',
          description: '請先登入 GitHub，再重新提交 commit。',
          type: 'warning',
          duration: 3200,
          closable: true,
        })
        void handleLoginGitHub()
        return
      }

      toaster.create({
        title: '建立 commit 失敗',
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
        title: '已合併上游變更',
        description: result.message,
        type: 'success',
        duration: 3600,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: '合併上游失敗',
        description: getErrorMessage(error, '目前無法合併上游變更。'),
        type: 'error',
        duration: 4200,
        closable: true,
      })
    }
  }

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
    isCreatingGitHubCommit:
      isCommittingToGitHub || createCommitMutation.isPending,
    // Committing before the report lands would skip the conflict gate.
    isCheckingSyncStatus: syncStatus.isLoading,
    isMergingGitHubUpstream: mergeUpstreamMutation.isPending,
    isSwitchingGitBranch,
    canCommitToGitHub,
    gitHubCommitMessage,
    suggestedCommitMessage,
    gitHubBranchName,
    isCreatingNewBranch: isCreatingNewGitHubBranch,
    onLoginGitHub: () => void handleLoginGitHub(),
    onLogoutGitHub: () => void handleLogoutGitHub(),
    onCreateFork: () => void handleCreateFork(),
    activeGitTarget: gitCollaboration.activeTarget,
    changeDrafts: gitCollaboration.changeDrafts,
    onBranchSelect: (branch) => {
      if (loadGitSyncEnabled()) {
        if (githubForkStatus?.targetRepo) {
          void handleSwitchGitBranch({
            repo: githubForkStatus.targetRepo.fullName,
            branch,
          })
        }
        return
      }
      updateGitHubCommitDraft({
        branchName: branch,
        isCreatingNewBranch: false,
      })
      void refreshGitHubCompareStatus(branch)
    },
    onSwitchToMergeTarget: () => {
      if (githubForkStatus?.sourceRepo) {
        void handleSwitchGitBranch({
          repo: githubForkStatus.sourceRepo.fullName,
          branch: githubForkStatus.sourceRepo.defaultBranch,
        })
      }
    },
    onCommitMessageChange: (commitMessage) =>
      updateGitHubCommitDraft({ commitMessage }),
    onBranchNameChange: (value) => {
      updateGitHubCommitDraft({
        branchName: value,
        isCreatingNewBranch: true,
      })
    },
    onStartNewBranch: () => {
      updateGitHubCommitDraft({
        branchName: `kumiko/patch-${Date.now()}`,
        isCreatingNewBranch: true,
      })
    },
    onOpenCompare: () => {
      if (githubForkStatus?.compare?.compareUrl) {
        window.open(
          githubForkStatus.compare.compareUrl,
          '_blank',
          'noopener,noreferrer'
        )
      }
    },
    onMergeUpstream: () => void handleMergeGitHubUpstream(),
    onCreateCommit: () => void handleCreateGitHubCommit(),
    isSyncEnabled: gitHubModal.open && hasGitHubSource,
    onBlockingSyncConflictsChange: setHasBlockingSyncConflicts,
    hasBlockingSyncConflicts,
  }

  return {
    openGitHubModal: handleOpenGitHubModal,
    modalProps,
  }
}
