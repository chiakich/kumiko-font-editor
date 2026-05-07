import { useDisclosure, useToast } from '@chakra-ui/react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  startGitHubOAuthLogin,
  type GitHubForkStatus,
} from 'src/lib/githubAuth'
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
} from 'src/lib/githubQueries'
import { markGitHubCommitSynced, prepareGitHubCommit } from 'src/lib/githubPr'
import { syncHotFontDataToUfoRecords } from 'src/lib/fontAdapters/ufo'
import type { FontData } from 'src/store'
import {
  buildSuggestedGitHubBranchName,
  getActiveUfoIdFromArchive,
  getErrorMessage,
  isExistingGitHubBranch,
  isMissingGitHubTokenError,
  resolveGitHubBranchSelection,
} from 'src/features/common/glyphInspector/githubCommitFlowUtils'
import type { GitHubCommitModalProps } from 'src/features/common/glyphInspector/GitHubCommitModal'

interface UseGitHubCommitFlowInput {
  projectId: string | null
  projectTitle: string
  fontData: FontData | null
  selectedLayerId: string | null
  hasGitHubSource: boolean
  githubRepoFullName: string | null
  canCommitToGitHub: boolean
  localDirtyGlyphIds: string[]
  localDeletedGlyphIds: string[]
  markDraftSaved: () => void
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
  localDirtyGlyphIds,
  localDeletedGlyphIds,
  markDraftSaved,
}: UseGitHubCommitFlowInput) => {
  const toast = useToast()
  const gitHubModal = useDisclosure()
  const [isPreparingGitHubCommit, setIsPreparingGitHubCommit] = useState(false)
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
      gitHubModal.isOpen &&
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

      toast({
        title: '讀取 GitHub 狀態失敗',
        description: message,
        status: 'error',
        duration: 3600,
        isClosable: true,
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
      toast({
        title: 'GitHub 已登入',
        description: `目前登入帳號：${viewer.login}`,
        status: 'success',
        duration: 2600,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: 'GitHub 登入失敗',
        description: getErrorMessage(error, '目前無法完成 GitHub 登入。'),
        status: 'error',
        duration: 3200,
        isClosable: true,
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
      toast({
        title: 'GitHub 已登出',
        description: '目前 session 已清除。',
        status: 'success',
        duration: 2200,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: 'GitHub 登出失敗',
        description: getErrorMessage(error, '目前無法登出 GitHub。'),
        status: 'error',
        duration: 3200,
        isClosable: true,
      })
    }
  }

  const handleOpenGitHubModal = async () => {
    gitHubModal.onOpen()

    if (!projectId || !projectTitle) {
      return
    }

    const activeUfoId = getActiveUfoIdFromArchive()

    if (!activeUfoId) {
      toast({
        title: '無法準備 GitHub 提交',
        description: '找不到目前啟用的 UFO 字重。',
        status: 'error',
        duration: 3200,
        isClosable: true,
      })
      return
    }

    const forkStatus = githubViewer
      ? await loadGitHubForkStatus(gitHubBranchName.trim() || undefined)
      : null

    if (!canCommitToGitHub) {
      return
    }

    try {
      setIsPreparingGitHubCommit(true)
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
      toast({
        title: '無法準備 GitHub commit',
        description: getErrorMessage(error, '目前沒有可提交到 GitHub 的變更。'),
        status: 'error',
        duration: 3200,
        isClosable: true,
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
      toast({
        title: 'GitHub fork 已建立',
        description: result.targetRepo?.fullName ?? githubRepoFullName,
        status: 'success',
        duration: 3200,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: '建立 fork 失敗',
        description: getErrorMessage(error, '目前無法建立 GitHub fork。'),
        status: 'error',
        duration: 3600,
        isClosable: true,
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
      toast({
        title: '無法建立 commit',
        description: '找不到目前啟用的 UFO 字重。',
        status: 'error',
        duration: 3200,
        isClosable: true,
      })
      return
    }

    if (!gitHubBranchName.trim()) {
      toast({
        title: '請先指定 branch',
        description: '你可以選現有 branch，或輸入一個新的 branch 名稱。',
        status: 'warning',
        duration: 2800,
        isClosable: true,
      })
      return
    }

    try {
      const syncResult = await syncHotFontDataToUfoRecords({
        projectId,
        activeUfoId,
        activeLayerId,
        fontData,
        dirtyGlyphIds: localDirtyGlyphIds,
        deletedGlyphIds: localDeletedGlyphIds,
      })

      const preparedCommit = await prepareGitHubCommit({
        projectId,
        projectTitle,
        activeUfoId,
        deletedFilePaths: syncResult.deletedFilePaths,
      })

      const result = await createCommitMutation.mutateAsync({
        ...preparedCommit.request,
        commitMessage:
          gitHubCommitMessage.trim() || preparedCommit.request.commitMessage,
        branchName: gitHubBranchName.trim(),
      })
      await markGitHubCommitSynced(preparedCommit.exportStateUpdates)
      markDraftSaved()
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
      toast({
        title: 'GitHub commit 已推送',
        description: `已更新 ${result.headOwner}:${result.branchName}`,
        status: 'success',
        duration: 3600,
        isClosable: true,
      })
    } catch (error) {
      const message = getErrorMessage(error, '目前無法建立 GitHub commit。')

      if (isMissingGitHubTokenError(message)) {
        toast({
          title: '需要 GitHub 登入',
          description: '請先登入 GitHub，再重新提交 commit。',
          status: 'warning',
          duration: 3200,
          isClosable: true,
        })
        void handleLoginGitHub()
        return
      }

      toast({
        title: '建立 commit 失敗',
        description: message,
        status: 'error',
        duration: 4200,
        isClosable: true,
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
      toast({
        title: '已合併上游變更',
        description: result.message,
        status: 'success',
        duration: 3600,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: '合併上游失敗',
        description: getErrorMessage(error, '目前無法合併上游變更。'),
        status: 'error',
        duration: 4200,
        isClosable: true,
      })
    }
  }

  const modalProps: GitHubCommitModalProps = {
    isOpen: gitHubModal.isOpen,
    onClose: gitHubModal.onClose,
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
  }

  return {
    openGitHubModal: handleOpenGitHubModal,
    modalProps,
  }
}
