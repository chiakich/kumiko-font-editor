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
import {
  GitHubSyncSection,
  type GitHubSyncSectionProps,
} from 'src/features/common/glyphInspector/GitHubSyncSection'
import { useTranslation } from 'react-i18next'

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
  sync: GitHubSyncSectionProps
  hasBlockingSyncConflicts: boolean
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
  sync,
  hasBlockingSyncConflicts,
}: GitHubCommitModalProps) {
  const { t } = useTranslation()

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
        <ModalHeader>{t('glyphInspector.githubCommit')}</ModalHeader>
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
                    <Text fontWeight="medium">
                      {t('glyphInspector.notSignedInToGitHub')}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {t('glyphInspector.gitHubLoginRequiredDescription')}
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
                    {t('glyphInspector.signOut')}
                  </Button>
                ) : (
                  <Button size="sm" onClick={onLoginGitHub}>
                    {t('glyphInspector.signInToGitHub')}
                  </Button>
                )}
              </HStack>
            </Box>

            <GitHubSyncSection {...sync} />

            {githubViewer ? (
              <>
                {isLoadingGitHubForkStatus ? (
                  <Text fontSize="sm" color="gray.500">
                    {t('glyphInspector.loadingForkBranch')}
                  </Text>
                ) : (
                  <>
                    <GitHubRepoCard
                      title={t('glyphInspector.sourceRepo')}
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
                      title={t('glyphInspector.editingRepo')}
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
                        <FormLabel>{t('glyphInspector.branch')}</FormLabel>
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
                            <option value="">
                              {t('glyphInspector.selectBranch')}
                            </option>
                            {githubForkStatus.branches.map((branch) => (
                              <option key={branch} value={branch}>
                                {branch}
                              </option>
                            ))}
                          </Select>
                          <IconButton
                            aria-label={t('glyphInspector.createBranch')}
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
                          <FormLabel>
                            {t('glyphInspector.branchName')}
                          </FormLabel>
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
                          <FormLabel>
                            {t('glyphInspector.commitMessage')}
                          </FormLabel>
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
                          {t('glyphInspector.noGitHubChanges')}
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          {t('glyphInspector.emptyCommitMessageHint')}
                        </Text>
                      </Box>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <Box borderWidth={1} borderRadius="lg" p={4} bg="gray.50">
                <Text fontWeight="medium" mb={1}>
                  {t('glyphInspector.signInFirst')}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  {t('glyphInspector.repoForkHint')}
                </Text>
              </Box>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onClose}>
            {t('glyphInspector.cancel')}
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
              isPreparingGitHubCommit ||
              hasBlockingSyncConflicts
            }
            loadingText="推送中..."
          >
            {t('glyphInspector.createCommit')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
