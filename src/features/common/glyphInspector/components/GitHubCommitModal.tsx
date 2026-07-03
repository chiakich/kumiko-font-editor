import {
  Avatar,
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Stack,
  Text,
  Field,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import type { GitHubForkStatus, GitHubViewer } from 'src/lib/github/githubAuth'
import { GitHubRepoCard } from 'src/features/common/glyphInspector/components/GitHubRepoCard'
import { GitHubSyncSectionContainer } from 'src/features/common/glyphInspector/components/GitHubSyncSection'
import type { QualitySummary } from 'src/lib/qualityCheck/qualityLint'
import { useTranslation } from 'react-i18next'

export interface GitHubCommitModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string | null
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
  isSyncEnabled: boolean
  onBlockingSyncConflictsChange: (hasBlockingSyncConflicts: boolean) => void
  hasBlockingSyncConflicts: boolean
  qualitySummary?: QualitySummary
  onOpenQualityCheck?: () => void
}

export function GitHubCommitModal({
  isOpen,
  onClose,
  projectId,
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
  isSyncEnabled,
  onBlockingSyncConflictsChange,
  hasBlockingSyncConflicts,
  qualitySummary,
  onOpenQualityCheck,
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
    <Dialog.Root
      open={isOpen}
      size="xl"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>{t('glyphInspector.githubCommit')}</Dialog.Header>
            <DialogCloseButton />
            <Dialog.Body>
              <Stack gap={4}>
                <Box borderWidth={1} borderRadius="lg" p={4}>
                  <HStack justify="space-between" align="center" gap={4}>
                    {githubViewer ? (
                      <HStack gap={3}>
                        <Avatar.Root size="sm">
                          <Avatar.Fallback
                            name={
                              githubViewer.name ??
                              githubViewer.login ??
                              undefined
                            }
                          />
                          <Avatar.Image
                            src={githubViewer.avatarUrl ?? undefined}
                          />
                        </Avatar.Root>
                        <Box>
                          <Text fontWeight="medium">
                            {githubViewer.name || githubViewer.login}
                          </Text>
                          <Text fontSize="sm" color="mutedForeground">
                            @{githubViewer.login}
                          </Text>
                        </Box>
                      </HStack>
                    ) : (
                      <Box>
                        <Text fontWeight="medium">
                          {t('glyphInspector.notSignedInToGitHub')}
                        </Text>
                        <Text fontSize="sm" color="mutedForeground">
                          {t('glyphInspector.gitHubLoginRequiredDescription')}
                        </Text>
                      </Box>
                    )}

                    {githubViewer ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onLogoutGitHub}
                        loading={isLoggingOutGitHub}
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

                <GitHubSyncSectionContainer
                  enabled={isSyncEnabled}
                  projectId={projectId}
                  onBlockingSyncConflictsChange={onBlockingSyncConflictsChange}
                />

                {qualitySummary ? (
                  <QualitySummaryCard
                    summary={qualitySummary}
                    onOpenQualityCheck={onOpenQualityCheck}
                  />
                ) : null}

                {githubViewer ? (
                  <>
                    {isLoadingGitHubForkStatus ? (
                      <Text fontSize="sm" color="mutedForeground">
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
                          badgeLabel={
                            isEditableRepoReadonly ? '唯讀' : '可寫入'
                          }
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
                          onAction={
                            shouldShowForkAction ? onCreateFork : undefined
                          }
                        />
                      </>
                    )}

                    {!isEditableRepoReadonly && editableRepo ? (
                      <>
                        {githubForkStatus?.branches.length ? (
                          <Field.Root>
                            <Field.Label>
                              {t('glyphInspector.branch')}
                            </Field.Label>
                            <HStack align="end">
                              <NativeSelect.Root>
                                <NativeSelect.Field
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
                                </NativeSelect.Field>
                                <NativeSelect.Indicator />
                              </NativeSelect.Root>
                              <IconButton
                                aria-label={t('glyphInspector.createBranch')}
                                size="sm"
                                variant="outline"
                                onClick={onStartNewBranch}
                              >
                                <span>+</span>
                              </IconButton>
                            </HStack>
                          </Field.Root>
                        ) : null}

                        {canCommitToGitHub ? (
                          <>
                            <Field.Root
                              display={isCreatingNewBranch ? 'block' : 'none'}
                            >
                              <Field.Label>
                                {t('glyphInspector.branchName')}
                              </Field.Label>
                              <Input
                                value={gitHubBranchName}
                                onChange={(event) =>
                                  onBranchNameChange(event.target.value)
                                }
                                placeholder="kumiko/update-glyphs"
                                disabled={isPreparingGitHubCommit}
                              />
                            </Field.Root>
                            <Field.Root>
                              <Field.Label>
                                {t('glyphInspector.commitMessage')}
                              </Field.Label>
                              <Input
                                value={gitHubCommitMessage}
                                onChange={(event) =>
                                  onCommitMessageChange(event.target.value)
                                }
                                disabled={isPreparingGitHubCommit}
                              />
                            </Field.Root>
                          </>
                        ) : (
                          <Box
                            borderWidth={1}
                            borderRadius="lg"
                            p={4}
                            bg="muted"
                          >
                            <Text fontWeight="medium" mb={1}>
                              {t('glyphInspector.noGitHubChanges')}
                            </Text>
                            <Text fontSize="sm" color="mutedForeground">
                              {t('glyphInspector.emptyCommitMessageHint')}
                            </Text>
                          </Box>
                        )}
                      </>
                    ) : null}
                  </>
                ) : (
                  <Box borderWidth={1} borderRadius="lg" p={4} bg="muted">
                    <Text fontWeight="medium" mb={1}>
                      {t('glyphInspector.signInFirst')}
                    </Text>
                    <Text fontSize="sm" color="mutedForeground">
                      {t('glyphInspector.repoForkHint')}
                    </Text>
                  </Box>
                )}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer gap={3}>
              <Button variant="ghost" onClick={onClose}>
                {t('glyphInspector.cancel')}
              </Button>
              <Button
                colorPalette="green"
                onClick={onCreateCommit}
                loading={isCreatingGitHubCommit}
                disabled={
                  !githubViewer ||
                  isEditableRepoReadonly ||
                  !editableRepo ||
                  !canCommitToGitHub ||
                  isPreparingGitHubCommit ||
                  hasBlockingSyncConflicts ||
                  Boolean(qualitySummary?.hasBlockingIssues)
                }
                loadingText="推送中..."
              >
                {qualitySummary?.hasBlockingIssues
                  ? '修正品質問題後提交'
                  : t('glyphInspector.createCommit')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function QualitySummaryCard({
  summary,
  onOpenQualityCheck,
}: {
  summary: QualitySummary
  onOpenQualityCheck?: () => void
}) {
  const { t } = useTranslation()
  const statusText = summary.hasBlockingIssues
    ? t('qualityCheck.commit.blockingStatus', {
        blocking: summary.blockingCount,
        warning: summary.warningCount,
      })
    : summary.warningCount > 0
      ? t('qualityCheck.commit.warningStatus', {
          warning: summary.warningCount,
        })
      : t('qualityCheck.commit.cleanStatus')

  return (
    <Box borderWidth={1} borderRadius="lg" p={4} bg="muted">
      <HStack justify="space-between" align="center" gap={4}>
        <Box>
          <HStack gap={2} mb={1}>
            <Text fontWeight="medium">{t('qualityCheck.commit.title')}</Text>
            <Badge colorPalette={summary.hasBlockingIssues ? 'red' : 'green'}>
              {summary.hasBlockingIssues
                ? t('qualityCheck.summary.blocking')
                : t('qualityCheck.commit.pass')}
            </Badge>
          </HStack>
          <Text fontSize="sm" color="mutedForeground">
            {t('qualityCheck.commit.checkedSummary', {
              status: statusText,
              count: summary.glyphCount,
            })}
            {summary.deletedCount !== null
              ? t('qualityCheck.commit.deletedSuffix', {
                  count: summary.deletedCount,
                })
              : ''}
          </Text>
        </Box>
        {onOpenQualityCheck ? (
          <Button size="sm" variant="outline" onClick={onOpenQualityCheck}>
            {t('qualityCheck.openShort')}
          </Button>
        ) : null}
      </HStack>
    </Box>
  )
}
