import {
  Avatar,
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Field,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { NativeSelect } from '@/components/ui/native-select'
import { useState } from 'react'
import type { GitHubForkStatus, GitHubViewer } from 'src/lib/github/githubAuth'
import { GitHubRepoCard } from 'src/features/common/glyphInspector/components/GitHubRepoCard'
import { GitHubSyncSectionContainer } from 'src/features/common/glyphInspector/components/GitHubSyncSection'
import type { QualitySummary } from 'src/lib/qualityCheck/qualityLint'
import { useTranslation } from 'react-i18next'
import type { GitHubSyncTarget } from 'src/lib/github/sync/types'

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
  // The sync report gates the commit, so committing has to wait for it.
  isCheckingSyncStatus: boolean
  isMergingGitHubUpstream: boolean
  isSwitchingGitBranch: boolean
  canCommitToGitHub: boolean
  gitHubCommitMessage: string
  // What the commit will say when the field is left empty.
  suggestedCommitMessage: string
  gitHubBranchName: string
  isCreatingNewBranch: boolean
  activeGitTarget: GitHubSyncTarget | null
  changeDrafts: GitHubSyncTarget[]
  onLoginGitHub: () => void
  onLogoutGitHub: () => void
  onCreateFork: () => void
  onBranchSelect: (branch: string) => void
  onSwitchToMergeTarget: () => void
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
  isCheckingSyncStatus,
  isMergingGitHubUpstream,
  isSwitchingGitBranch,
  canCommitToGitHub,
  gitHubCommitMessage,
  suggestedCommitMessage,
  gitHubBranchName,
  isCreatingNewBranch,
  activeGitTarget,
  changeDrafts,
  onLoginGitHub,
  onLogoutGitHub,
  onCreateFork,
  onBranchSelect,
  onSwitchToMergeTarget,
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
  const [showAdvancedBranchOptions, setShowAdvancedBranchOptions] =
    useState(false)

  const sourceRepo = githubForkStatus?.sourceRepo ?? null
  const editableRepo = githubForkStatus?.targetRepo ?? null
  const isEditableRepoReadonly = Boolean(editableRepo && !editableRepo.canPush)
  const hasPersonalFork = Boolean(githubForkStatus?.forked)
  const canCreatePersonalFork = Boolean(
    githubViewer &&
    githubForkStatus &&
    !githubForkStatus.canDirectCommit &&
    !githubForkStatus.targetRepo
  )
  const compare = githubForkStatus?.compare
  const isViewingMergeTarget = Boolean(
    activeGitTarget &&
    sourceRepo &&
    activeGitTarget.owner === sourceRepo.owner &&
    activeGitTarget.repo === sourceRepo.repo &&
    activeGitTarget.ref === sourceRepo.defaultBranch
  )
  const activeBranchInEditableRepo =
    activeGitTarget &&
    editableRepo &&
    activeGitTarget.owner === editableRepo.owner &&
    activeGitTarget.repo === editableRepo.repo
      ? activeGitTarget.ref
      : ''
  const proposalStatusText = isViewingMergeTarget
    ? '目前正在檢視合併目標；已送出的修改草稿保留在下方，可隨時切換查看。'
    : compare
      ? compare.aheadBy === 0 && compare.behindBy === 0
        ? '目前沒有等待合併的修改。'
        : compare.aheadBy > 0 && compare.behindBy === 0
          ? `已送出 ${compare.aheadBy} 個修改，等待合併。`
          : compare.aheadBy === 0 && compare.behindBy > 0
            ? `合併目標有 ${compare.behindBy} 個新修改，建議先更新。`
            : `已送出 ${compare.aheadBy} 個修改；合併目標也有 ${compare.behindBy} 個新修改。`
      : null
  const proposalActionLabel =
    !isViewingMergeTarget && compare
      ? compare.behindBy > 0
        ? '更新這次修改'
        : compare.aheadBy > 0
          ? '查看修改提案'
          : null
      : null
  const activityText = isSwitchingGitBranch
    ? '正在切換目前檢視版本…'
    : isCreatingGitHubCommit
      ? '正在送出修改到 GitHub…'
      : isPreparingGitHubCommit
        ? '正在整理這次修改…'
        : isCheckingSyncStatus
          ? '正在檢查合併目標的更新…'
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

                {githubViewer && githubViewer.canPush === false ? (
                  // A read-only token authenticates fine and only fails at push
                  // time, with git's own "Permission to X denied to Y".
                  <Box
                    borderWidth={1}
                    borderRadius="lg"
                    p={3}
                    borderColor="orange.300"
                  >
                    <Text fontSize="sm" color="orange.600" mb={2}>
                      {t('glyphInspector.missingPushScope', {
                        scopes: githubViewer.scopes?.join(', ') || '—',
                      })}
                    </Text>
                    <Button size="xs" onClick={onLoginGitHub}>
                      {t('glyphInspector.reauthorizeGitHub')}
                    </Button>
                  </Box>
                ) : null}

                {activityText ? (
                  <HStack gap={2} color="mutedForeground">
                    <Spinner size="xs" />
                    <Text fontSize="sm">{activityText}</Text>
                  </HStack>
                ) : null}

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
                      // Source and editing repo read as a pair: same row, so
                      // the difference between them is visible at a glance.
                      <SimpleGrid
                        columns={{ base: 1, md: 2 }}
                        gap={3}
                        alignItems="stretch"
                      >
                        <GitHubRepoCard
                          title={t('glyphInspector.mergeTarget')}
                          repo={sourceRepo}
                          branchLabel={t(
                            'glyphInspector.developmentVersionLabel'
                          )}
                          helperText="你的修改會申請合併到這個專案的開發版。"
                          statusText={proposalStatusText}
                          statusActionLabel={proposalActionLabel}
                          isStatusActionDisabled={
                            !compare ||
                            (compare.aheadBy <= 0 && compare.behindBy <= 0)
                          }
                          isStatusActionLoading={isMergingGitHubUpstream}
                          onStatusAction={
                            compare?.behindBy
                              ? onMergeUpstream
                              : compare?.aheadBy
                                ? onOpenCompare
                                : undefined
                          }
                        />
                        <GitHubRepoCard
                          title={
                            hasPersonalFork
                              ? t('glyphInspector.personalGitHubCopy')
                              : t('glyphInspector.submissionLocation')
                          }
                          repo={editableRepo}
                          showDefaultBranch={false}
                          badgeLabel={
                            editableRepo
                              ? isEditableRepoReadonly
                                ? '唯讀'
                                : '可寫入'
                              : null
                          }
                          badgeColorScheme={
                            isEditableRepoReadonly ? 'orange' : 'green'
                          }
                          helperText={
                            hasPersonalFork
                              ? '這是 GitHub 上屬於你的副本；修改會先送到這裡，原始專案不會被直接修改。'
                              : editableRepo
                                ? '你可以直接送出修改到這個專案。'
                                : '先建立屬於你的 GitHub 副本，修改才能安全地送出並申請合併。'
                          }
                          actionLabel={
                            canCreatePersonalFork
                              ? t('glyphInspector.createPersonalGitHubCopy')
                              : null
                          }
                          isActionLoading={isCreatingGitHubFork}
                          onAction={
                            canCreatePersonalFork ? onCreateFork : undefined
                          }
                        />
                      </SimpleGrid>
                    )}

                    {!isEditableRepoReadonly && editableRepo ? (
                      <>
                        {canCommitToGitHub ? (
                          <Field.Root>
                            <Field.Label>
                              {t('glyphInspector.commitMessage')}
                            </Field.Label>
                            <Input
                              value={gitHubCommitMessage}
                              onChange={(event) =>
                                onCommitMessageChange(event.target.value)
                              }
                              placeholder={suggestedCommitMessage}
                              disabled={isPreparingGitHubCommit}
                            />
                          </Field.Root>
                        ) : null}
                        <Box borderWidth={1} borderRadius="md" p={3}>
                          <HStack justify="space-between" gap={3}>
                            <Box>
                              <Text fontSize="sm" fontWeight="medium">
                                {t('glyphInspector.advancedControls')}
                              </Text>
                              <Text fontSize="xs" color="mutedForeground">
                                {t(
                                  'glyphInspector.advancedControlsDescription'
                                )}
                              </Text>
                            </Box>
                            <Button
                              size="sm"
                              variant="outline"
                              aria-expanded={showAdvancedBranchOptions}
                              onClick={() =>
                                setShowAdvancedBranchOptions(
                                  (current) => !current
                                )
                              }
                            >
                              {showAdvancedBranchOptions
                                ? t('glyphInspector.hideAdvancedControls')
                                : t('glyphInspector.showAdvancedControls')}
                            </Button>
                          </HStack>
                          {showAdvancedBranchOptions ? (
                            <Stack gap={3} mt={3}>
                              <Text fontSize="sm" color="mutedForeground">
                                一般情況不需要調整。Kumiko
                                會用這次修改的草稿位置來送出內容。
                              </Text>
                              {isSyncEnabled ? (
                                <Box
                                  borderWidth={1}
                                  borderRadius="md"
                                  p={3}
                                  bg="muted"
                                >
                                  <Text fontSize="sm" fontWeight="medium">
                                    目前檢視版本
                                  </Text>
                                  <Text fontSize="sm" color="mutedForeground">
                                    {activeGitTarget
                                      ? `${activeGitTarget.owner}/${activeGitTarget.repo} · ${activeGitTarget.ref}`
                                      : '尚未讀取版本資訊'}
                                  </Text>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    mt={2}
                                    onClick={onSwitchToMergeTarget}
                                    disabled={
                                      isSwitchingGitBranch ||
                                      isViewingMergeTarget ||
                                      !sourceRepo
                                    }
                                  >
                                    切換到合併目標（
                                    {sourceRepo?.defaultBranch ?? '預設版本'}）
                                  </Button>
                                </Box>
                              ) : null}
                              {githubForkStatus?.branches.length ? (
                                <Field.Root>
                                  <Field.Label>
                                    {isSyncEnabled
                                      ? '切換到你的 GitHub 副本中的版本'
                                      : t('glyphInspector.branch')}
                                  </Field.Label>
                                  <HStack align="end">
                                    <NativeSelect
                                      disabled={isSwitchingGitBranch}
                                      fieldProps={{
                                        value: isSyncEnabled
                                          ? githubForkStatus.branches.includes(
                                              activeBranchInEditableRepo
                                            )
                                            ? activeBranchInEditableRepo
                                            : ''
                                          : !isCreatingNewBranch &&
                                              githubForkStatus.branches.includes(
                                                gitHubBranchName.trim()
                                              )
                                            ? gitHubBranchName.trim()
                                            : '',
                                        onChange: (event) =>
                                          onBranchSelect(event.target.value),
                                      }}
                                    >
                                      <option value="">
                                        {t('glyphInspector.selectBranch')}
                                      </option>
                                      {githubForkStatus.branches.map(
                                        (branch) => (
                                          <option key={branch} value={branch}>
                                            {branch}
                                          </option>
                                        )
                                      )}
                                    </NativeSelect>
                                    <IconButton
                                      aria-label={t(
                                        'glyphInspector.createBranch'
                                      )}
                                      size="sm"
                                      variant="outline"
                                      onClick={onStartNewBranch}
                                      disabled={isSwitchingGitBranch}
                                    >
                                      <span>+</span>
                                    </IconButton>
                                  </HStack>
                                </Field.Root>
                              ) : null}
                              {isSyncEnabled && changeDrafts.length > 0 ? (
                                <Box borderWidth={1} borderRadius="md" p={3}>
                                  <Text fontSize="sm" fontWeight="medium">
                                    已送出的修改草稿
                                  </Text>
                                  <Stack gap={2} mt={2}>
                                    {changeDrafts.map((draft) => {
                                      const isActive =
                                        activeGitTarget?.owner ===
                                          draft.owner &&
                                        activeGitTarget.repo === draft.repo &&
                                        activeGitTarget.ref === draft.ref
                                      return (
                                        <HStack
                                          key={`${draft.owner}/${draft.repo}:${draft.ref}`}
                                          justify="space-between"
                                          gap={3}
                                        >
                                          <Text fontSize="sm">{draft.ref}</Text>
                                          {isActive ? (
                                            <Badge colorPalette="blue">
                                              目前檢視
                                            </Badge>
                                          ) : (
                                            <Button
                                              size="xs"
                                              variant="outline"
                                              onClick={() =>
                                                onBranchSelect(draft.ref)
                                              }
                                              disabled={isSwitchingGitBranch}
                                            >
                                              切換查看
                                            </Button>
                                          )}
                                        </HStack>
                                      )
                                    })}
                                  </Stack>
                                </Box>
                              ) : null}
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
                            </Stack>
                          ) : null}
                        </Box>
                        {!canCommitToGitHub ? (
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
                        ) : null}
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
                  githubViewer.canPush === false ||
                  isPreparingGitHubCommit ||
                  isCheckingSyncStatus ||
                  hasBlockingSyncConflicts ||
                  Boolean(qualitySummary?.hasBlockingIssues)
                }
                loadingText={t('glyphInspector.pushingCommit')}
              >
                {qualitySummary?.hasBlockingIssues
                  ? '修正品質問題後提交'
                  : isCheckingSyncStatus
                    ? t('glyphInspector.checkingRemote')
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
