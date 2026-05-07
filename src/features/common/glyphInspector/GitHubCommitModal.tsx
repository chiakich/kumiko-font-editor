import {
  Avatar,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Text,
} from '@chakra-ui/react'
import type { GitHubForkStatus, GitHubViewer } from 'src/lib/githubAuth'
import { GitHubRepoCard } from 'src/features/common/glyphInspector/GitHubRepoCard'

export interface GitHubCommitModalProps {
  isOpen: boolean
  onClose: () => void
  githubViewer: GitHubViewer | null
  githubForkStatus: GitHubForkStatus | null
  isLoggingOutGitHub: boolean
  isLoadingGitHubForkStatus: boolean
  isCreatingGitHubFork: boolean
  isPreparingGitHubCommit: boolean
  isCreatingGitHubCommit: boolean
  isMergingGitHubUpstream: boolean
  canCommitToGitHub: boolean
  gitHubCommitMessage: string
  gitHubBranchName: string
  isCreatingNewBranch: boolean
  onLoginGitHub: () => void
  onLogoutGitHub: () => void
  onCreateFork: () => void
  onBranchSelect: (branch: string) => void
  onCommitMessageChange: (value: string) => void
  onBranchNameChange: (value: string) => void
  onStartNewBranch: () => void
  onOpenCompare: () => void
  onMergeUpstream: () => void
  onCreateCommit: () => void
}

export function GitHubCommitModal({
  isOpen,
  onClose,
  githubViewer,
  githubForkStatus,
  isLoggingOutGitHub,
  isLoadingGitHubForkStatus,
  isCreatingGitHubFork,
  isPreparingGitHubCommit,
  isCreatingGitHubCommit,
  isMergingGitHubUpstream,
  canCommitToGitHub,
  gitHubCommitMessage,
  gitHubBranchName,
  isCreatingNewBranch,
  onLoginGitHub,
  onLogoutGitHub,
  onCreateFork,
  onBranchSelect,
  onCommitMessageChange,
  onBranchNameChange,
  onStartNewBranch,
  onOpenCompare,
  onMergeUpstream,
  onCreateCommit,
}: GitHubCommitModalProps) {
  const sourceRepo = githubForkStatus?.sourceRepo ?? null
  const editableRepo = githubForkStatus?.targetRepo ?? sourceRepo
  const isEditableRepoReadonly = Boolean(editableRepo && !editableRepo.canPush)
  const shouldShowForkAction = Boolean(
    githubViewer &&
    editableRepo &&
    editableRepo.owner.toLowerCase() !== githubViewer.login?.toLowerCase()
  )
  const compare = githubForkStatus?.compare
  const sourceStatusText = compare
    ? compare.aheadBy === 0 && compare.behindBy === 0
      ? '同步'
      : compare.aheadBy > 0 && compare.behindBy === 0
        ? `落後 ${compare.aheadBy} 個 commit`
        : compare.aheadBy === 0 && compare.behindBy > 0
          ? `有 ${compare.behindBy} 個新 commit`
          : `落後 ${compare.aheadBy} 個 commit，且有 ${compare.behindBy} 個新 commit`
    : null
  const sourceActionLabel = compare
    ? compare.aheadBy > 0
      ? '發送PR'
      : compare.behindBy > 0
        ? '合併'
        : null
    : null

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>GitHub / Commit</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Box borderWidth={1} borderRadius="lg" p={4}>
              <HStack justify="space-between" align="center" spacing={4}>
                {githubViewer ? (
                  <HStack spacing={3}>
                    <Avatar
                      size="sm"
                      name={
                        githubViewer.name ?? githubViewer.login ?? undefined
                      }
                      src={githubViewer.avatarUrl ?? undefined}
                    />
                    <Box>
                      <Text fontWeight="medium">
                        {githubViewer.name || githubViewer.login}
                      </Text>
                      <Text fontSize="sm" color="gray.500">
                        @{githubViewer.login}
                      </Text>
                    </Box>
                  </HStack>
                ) : (
                  <Box>
                    <Text fontWeight="medium">尚未登入 GitHub</Text>
                    <Text fontSize="sm" color="gray.500">
                      登入後才能檢查 fork、推送 commit，並前往 GitHub compare
                      頁。
                    </Text>
                  </Box>
                )}

                {githubViewer ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onLogoutGitHub}
                    isLoading={isLoggingOutGitHub}
                  >
                    登出
                  </Button>
                ) : (
                  <Button size="sm" onClick={onLoginGitHub}>
                    登入 GitHub
                  </Button>
                )}
              </HStack>
            </Box>

            {githubViewer ? (
              <>
                {isLoadingGitHubForkStatus ? (
                  <Text fontSize="sm" color="gray.500">
                    正在讀取 fork 與 branch 狀態...
                  </Text>
                ) : (
                  <>
                    <GitHubRepoCard
                      title="來源 repo"
                      repo={sourceRepo}
                      statusText={sourceStatusText}
                      statusActionLabel={sourceActionLabel}
                      isStatusActionDisabled={
                        !compare ||
                        (compare.aheadBy <= 0 && compare.behindBy <= 0)
                      }
                      isStatusActionLoading={isMergingGitHubUpstream}
                      onStatusAction={
                        compare?.aheadBy
                          ? onOpenCompare
                          : compare?.behindBy
                            ? onMergeUpstream
                            : undefined
                      }
                    />
                    <GitHubRepoCard
                      title="目前編輯 repo"
                      repo={editableRepo}
                      badgeLabel={isEditableRepoReadonly ? '唯讀' : '可寫入'}
                      badgeColorScheme={
                        isEditableRepoReadonly ? 'orange' : 'green'
                      }
                      helperText={
                        isEditableRepoReadonly
                          ? '這個 repo 目前對你是唯讀。先 fork 到自己的帳號，才可以選 branch 與提交 commit。'
                          : '這個 repo 可以直接建立或選擇 branch，並提交目前變更。'
                      }
                      actionLabel={shouldShowForkAction ? 'Fork' : null}
                      isActionLoading={isCreatingGitHubFork}
                      onAction={shouldShowForkAction ? onCreateFork : undefined}
                    />
                  </>
                )}

                {!isEditableRepoReadonly && editableRepo ? (
                  <>
                    {githubForkStatus?.branches.length ? (
                      <FormControl>
                        <FormLabel>Branch</FormLabel>
                        <HStack align="end">
                          <Select
                            value={
                              !isCreatingNewBranch &&
                              githubForkStatus.branches.includes(
                                gitHubBranchName.trim()
                              )
                                ? gitHubBranchName.trim()
                                : ''
                            }
                            onChange={(event) =>
                              onBranchSelect(event.target.value)
                            }
                          >
                            <option value="">選擇 branch</option>
                            {githubForkStatus.branches.map((branch) => (
                              <option key={branch} value={branch}>
                                {branch}
                              </option>
                            ))}
                          </Select>
                          <IconButton
                            aria-label="建立新 branch"
                            icon={<span>+</span>}
                            size="sm"
                            variant="outline"
                            onClick={onStartNewBranch}
                          />
                        </HStack>
                      </FormControl>
                    ) : null}

                    {canCommitToGitHub ? (
                      <>
                        <FormControl
                          display={isCreatingNewBranch ? 'block' : 'none'}
                        >
                          <FormLabel>Branch 名稱</FormLabel>
                          <Input
                            value={gitHubBranchName}
                            onChange={(event) =>
                              onBranchNameChange(event.target.value)
                            }
                            placeholder="kumiko/update-glyphs"
                            isDisabled={isPreparingGitHubCommit}
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>Commit message</FormLabel>
                          <Input
                            value={gitHubCommitMessage}
                            onChange={(event) =>
                              onCommitMessageChange(event.target.value)
                            }
                            isDisabled={isPreparingGitHubCommit}
                          />
                        </FormControl>
                      </>
                    ) : (
                      <Box borderWidth={1} borderRadius="lg" p={4} bg="gray.50">
                        <Text fontWeight="medium" mb={1}>
                          目前沒有可送出的 GitHub 變更
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          先新增或修改 glyph，這裡就會自動帶出 commit message。
                        </Text>
                      </Box>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <Box borderWidth={1} borderRadius="lg" p={4} bg="gray.50">
                <Text fontWeight="medium" mb={1}>
                  先登入 GitHub
                </Text>
                <Text fontSize="sm" color="gray.600">
                  登入後這裡會顯示來源 repo、目前編輯 repo，以及是否需要先
                  fork。
                </Text>
              </Box>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            colorScheme="green"
            onClick={onCreateCommit}
            isLoading={isCreatingGitHubCommit}
            isDisabled={
              !githubViewer ||
              isEditableRepoReadonly ||
              !editableRepo ||
              !canCommitToGitHub ||
              isPreparingGitHubCommit
            }
            loadingText="推送中..."
          >
            建立 Commit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
