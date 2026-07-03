import { toaster } from '@/components/ui/toaster'
import { useDisclosure } from '@chakra-ui/react'
import { useState } from 'react'
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
  getActiveUfoIdFromArchive,
  getErrorMessage,
  isExistingGitHubBranch,
  isMissingGitHubTokenError,
  resolveGitHubBranchSelection,
} from 'src/features/common/glyphInspector/utils/githubCommitFlowUtils'
import type { GitHubCommitModalProps } from 'src/features/common/glyphInspector/components/GitHubCommitModal'
import { githubSyncReportQueryKey } from 'src/features/common/glyphInspector/hooks/useGitHubSyncStatus'
import { projectSyncDirtyStatusQueryKey } from 'src/features/common/glyphInspector/hooks/useProjectSyncDirtyStatus'
import { useTranslation } from 'react-i18next'

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
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const editLocation = useStore((state) => state.editLocation)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const gitHubModal = useDisclosure()
  const [isPreparingGitHubCommit, setIsPreparingGitHubCommit] = useState(false)
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
  const loadGitHubForkStatus = async (branchName?: string) => {
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
      if (resolvedBranch) {
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

  const handleLoginGitHub = async () => {
    try {
      const viewer = await loginMutation.mutateAsync(startGitHubOAuthLogin)
      if (githubRepoFullName) {
        await loadGitHubForkStatus(gitHubBranchName.trim() || undefined)
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

    const activeUfoId = getActiveUfoIdFromArchive()

    if (!activeUfoId) {
      toaster.create({
        title: '無法準備 GitHub 提交',
        description: '找不到目前啟用的 UFO 字重。',
        type: 'error',
        duration: 3200,
        closable: true,
      })
      return
    }

    const forkStatus = githubViewer
      ? await loadGitHubForkStatus(gitHubBranchName.trim() || undefined)
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
      const preparedCommit = await prepareGitHubCommit({
        projectId,
        projectTitle,
        activeUfoId,
      })
      const nextDraft: Partial<Omit<ScopedGitHubCommitDraft, 'repoFullName'>> =
        {
          commitMessage: preparedCommit.request.commitMessage,
        }
      if (!gitHubBranchName.trim()) {
        if (forkStatus?.selectedBranch) {
          nextDraft.branchName = forkStatus.selectedBranch
          nextDraft.isCreatingNewBranch = false
        } else {
          nextDraft.branchName =
            preparedCommit.request.branchName ??
            buildSuggestedGitHubBranchName(preparedCommit.changedGlyphNames)
          nextDraft.isCreatingNewBranch = true
        }
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
      if (!gitHubBranchName.trim() && result.selectedBranch) {
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

    const activeUfoId = getActiveUfoIdFromArchive()
    const activeLayerId = selectedLayerId ?? 'public.default'

    if (!activeUfoId) {
      toaster.create({
        title: '無法建立 commit',
        description: '找不到目前啟用的 UFO 字重。',
        type: 'error',
        duration: 3200,
        closable: true,
      })
      return
    }

    if (!gitHubBranchName.trim()) {
      toaster.create({
        title: '請先指定 branch',
        description: '你可以選現有 branch，或輸入一個新的 branch 名稱。',
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

    if (persistenceStatus === 'error') {
      return
    }

    try {
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

      const preparedCommit = await prepareGitHubCommit({
        projectId,
        projectTitle,
        activeUfoId,
      })

      const result = await createCommitMutation.mutateAsync({
        ...preparedCommit.request,
        commitMessage:
          gitHubCommitMessage.trim() || preparedCommit.request.commitMessage,
        branchName: gitHubBranchName.trim(),
      })
      await markGitHubCommitSynced(preparedCommit.exportStateUpdates, {
        projectId,
        activeUfoId,
        headOwner: result.headOwner,
        branchName: result.branchName,
        commitSha: result.commitSha,
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
      toaster.create({
        title: 'GitHub commit 已推送',
        description: `已更新 ${result.headOwner}:${result.branchName}`,
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
    isCreatingGitHubCommit: createCommitMutation.isPending,
    isMergingGitHubUpstream: mergeUpstreamMutation.isPending,
    canCommitToGitHub,
    gitHubCommitMessage,
    gitHubBranchName,
    isCreatingNewBranch: isCreatingNewGitHubBranch,
    onLoginGitHub: () => void handleLoginGitHub(),
    onLogoutGitHub: () => void handleLogoutGitHub(),
    onCreateFork: () => void handleCreateFork(),
    onBranchSelect: (branch) => {
      updateGitHubCommitDraft({
        branchName: branch,
        isCreatingNewBranch: false,
      })
      void refreshGitHubCompareStatus(branch)
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
