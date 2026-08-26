import {
  Avatar,
  Box,
  Button,
  Dialog,
  HStack,
  Portal,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitHubForkStatus, GitHubViewer } from 'src/lib/github/githubAuth'
import type { GitHubSyncTarget } from 'src/lib/github/sync/types'
import type { QualitySummary } from 'src/lib/qualityCheck/qualityLint'
import { GitHubSyncSectionContainer } from 'src/features/common/glyphInspector/components/GitHubSyncSection'
import {
  ChangeReceipt,
  type ReceiptFilter,
  type ReceiptStamp,
} from 'src/features/common/glyphInspector/components/ChangeReceipt'
import {
  FirstContributionAction,
  FirstContributionPanel,
  type FirstContributionStage,
} from 'src/features/common/glyphInspector/components/gitFlow/FirstContributionPanel'
import {
  SubmitWorkbench,
  type WorkbenchProposal,
  type WorkbenchState,
} from 'src/features/common/glyphInspector/components/gitFlow/SubmitWorkbench'
import type { ChangeReceipt as ChangeReceiptModel } from 'src/features/common/glyphInspector/utils/changeReceipt'

export interface GitHubSubmitResult {
  branch: string
  commitSha: string
  compareUrl: string | null
}

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
  canCommitToGitHub: boolean
  gitHubCommitMessage: string
  // What the commit will say when the field is left empty.
  suggestedCommitMessage: string
  gitHubBranchName: string
  changeDrafts: GitHubSyncTarget[]
  changeReceipt: ChangeReceiptModel
  voidedLineKeys: string[]
  submitErrorMessage: string | null
  lastSubmitResult: GitHubSubmitResult | null
  baseSha: string | null
  onToggleVoidLine: (key: string) => void
  onLoginGitHub: () => void
  onLogoutGitHub: () => void
  onCreateFork: () => void
  onCommitMessageChange: (value: string) => void
  onSelectDraft: (ref: string) => void
  onStartNewBranch: () => void
  onMergeUpstream: () => void
  onCreateCommit: () => void
  isSyncEnabled: boolean
  onBlockingSyncConflictsChange: (hasBlockingSyncConflicts: boolean) => void
  hasBlockingSyncConflicts: boolean
  qualitySummary?: QualitySummary
  onOpenQualityCheck?: () => void
}

const shortSha = (sha: string | null) => (sha ? sha.slice(0, 7) : null)

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
  canCommitToGitHub,
  gitHubCommitMessage,
  suggestedCommitMessage,
  gitHubBranchName,
  changeDrafts,
  changeReceipt,
  voidedLineKeys,
  submitErrorMessage,
  lastSubmitResult,
  baseSha,
  onToggleVoidLine,
  onLoginGitHub,
  onLogoutGitHub,
  onCreateFork,
  onCommitMessageChange,
  onSelectDraft,
  onStartNewBranch,
  onMergeUpstream,
  onCreateCommit,
  isSyncEnabled,
  onBlockingSyncConflictsChange,
  hasBlockingSyncConflicts,
  qualitySummary,
  onOpenQualityCheck,
}: GitHubCommitModalProps) {
  const { t } = useTranslation()
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>('all')

  const sourceRepo = githubForkStatus?.sourceRepo ?? null
  const editableRepo = githubForkStatus?.targetRepo ?? null
  const compare = githubForkStatus?.compare ?? null
  const voidedKeys = new Set(voidedLineKeys)
  const voidedCount = [
    ...changeReceipt.glyphLines,
    ...changeReceipt.fontLines,
  ].filter((line) => voidedKeys.has(line.key)).length
  const sendCount = changeReceipt.totalCount - voidedCount
  const mergeTargetLabel = sourceRepo
    ? `${sourceRepo.fullName} · ${sourceRepo.defaultBranch}`
    : t('gitFlow.route.unknownTarget')
  const draftName = gitHubBranchName.trim() || t('gitFlow.route.newDraft')

  // Which mode: the pre-fork ladder exists only until a writable copy does.
  const firstRunStage: FirstContributionStage | null = !githubViewer
    ? 'signIn'
    : isCreatingGitHubFork
      ? 'creatingFork'
      : !editableRepo
        ? 'noFork'
        : null

  const workbenchState: WorkbenchState = submitErrorMessage
    ? 'failed'
    : lastSubmitResult
      ? 'submitted'
      : hasBlockingSyncConflicts || changeReceipt.conflictCount > 0
        ? 'conflict'
        : changeReceipt.totalCount === 0
          ? 'empty'
          : 'ready'

  const stamp: ReceiptStamp | null =
    workbenchState === 'submitted' && lastSubmitResult
      ? {
          label: t('gitFlow.receipt.stampSent'),
          detail: shortSha(lastSubmitResult.commitSha) ?? '',
          tone: 'success',
        }
      : workbenchState === 'failed'
        ? {
            label: t('gitFlow.receipt.stampFailed'),
            detail: t('gitFlow.receipt.stampFailedDetail'),
            tone: 'error',
          }
        : null

  const commitSha = shortSha(lastSubmitResult?.commitSha ?? null)
  const receiptHash = commitSha ?? shortSha(baseSha)
  const hashLabel = commitSha
    ? `COMMIT ${commitSha.toUpperCase()}`
    : baseSha
      ? `BASE ${shortSha(baseSha)?.toUpperCase()}`
      : t('gitFlow.receipt.noHash')
  const verdict =
    workbenchState === 'submitted'
      ? t('gitFlow.receipt.verdictSent')
      : workbenchState === 'failed'
        ? t('gitFlow.receipt.verdictFailed')
        : changeReceipt.totalCount === 0
          ? t('gitFlow.receipt.verdictEmpty')
          : workbenchState === 'conflict'
            ? t('gitFlow.receipt.verdictConflict')
            : t('gitFlow.receipt.verdictPending')

  const proposal: WorkbenchProposal | null =
    workbenchState === 'submitted' && lastSubmitResult
      ? {
          title: t('gitFlow.proposal.submittedTitle'),
          body: t('gitFlow.proposal.submittedBody'),
          url: lastSubmitResult.compareUrl,
        }
      : workbenchState === 'empty' && compare && compare.aheadBy > 0
        ? {
            title: t('gitFlow.proposal.previousTitle'),
            body: t('gitFlow.proposal.previousBody', {
              count: compare.aheadBy,
            }),
            url: compare.compareUrl ?? null,
          }
        : null

  const hasBlockingQuality = Boolean(qualitySummary?.hasBlockingIssues)
  const isSubmitBlocked =
    workbenchState === 'empty' ||
    // Everything on the receipt struck out is the same as nothing to send.
    sendCount === 0 ||
    workbenchState === 'conflict' ||
    hasBlockingQuality ||
    !canCommitToGitHub ||
    !editableRepo ||
    githubViewer?.canPush === false ||
    isPreparingGitHubCommit ||
    isCheckingSyncStatus
  const primaryLabel = hasBlockingQuality
    ? t('gitFlow.footer.fixQualityFirst')
    : workbenchState === 'empty' ||
        (sendCount === 0 && workbenchState !== 'submitted')
      ? t('gitFlow.footer.nothingToSend')
      : workbenchState === 'conflict'
        ? t('gitFlow.footer.resolveFirst')
        : workbenchState === 'failed'
          ? t('gitFlow.footer.retry')
          : workbenchState === 'submitted'
            ? t('gitFlow.proposal.viewProposal')
            : isCheckingSyncStatus
              ? t('glyphInspector.checkingRemote')
              : t('gitFlow.footer.send', { count: sendCount })

  const footerMeta =
    workbenchState === 'submitted' && lastSubmitResult
      ? `${editableRepo?.fullName ?? ''} · ${lastSubmitResult.branch}`
      : workbenchState === 'failed'
        ? t('gitFlow.footer.pushAborted')
        : isAdvancedOpen && baseSha
          ? `base ${shortSha(baseSha)} · ${sendCount} files`
          : t('gitFlow.footer.savedLocally')

  return (
    <Dialog.Root
      open={isOpen}
      size="cover"
      onOpenChange={(event) => {
        if (!event.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            maxWidth="1100px"
            height="min(840px, 92vh)"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <Dialog.Header
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={4}
            >
              <HStack gap={2.5} minWidth={0}>
                <Text textStyle="heading">{t('gitFlow.title')}</Text>
                <Text
                  fontFamily="mono"
                  px={1.5}
                  py={0.5}
                  borderRadius="sm"
                  bg="muted"
                  fontSize="11px"
                  fontWeight={600}
                  color="mutedForeground"
                  lineClamp={1}
                >
                  {editableRepo?.fullName ?? sourceRepo?.fullName ?? ''}
                </Text>
              </HStack>
              {githubViewer ? (
                <HStack gap={2.5} flexShrink={0}>
                  <Avatar.Root size="xs">
                    <Avatar.Fallback name={githubViewer.login ?? undefined} />
                    <Avatar.Image src={githubViewer.avatarUrl ?? undefined} />
                  </Avatar.Root>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={onLogoutGitHub}
                    loading={isLoggingOutGitHub}
                  >
                    {t('glyphInspector.signOut')}
                  </Button>
                </HStack>
              ) : null}
            </Dialog.Header>
            <DialogCloseButton />

            <Dialog.Body
              display="flex"
              gap={0}
              p={0}
              flexGrow={1}
              minHeight={0}
            >
              <Stack
                width="372px"
                flexShrink={0}
                gap={2.5}
                px={3.5}
                py={4}
                borderRightWidth={1}
                borderColor="controlBorder"
                bg="muted"
                minHeight={0}
              >
                <ChangeReceipt
                  receipt={changeReceipt}
                  voidedKeys={voidedKeys}
                  onToggleVoid={
                    // A shipped receipt is a record, not a form.
                    workbenchState === 'submitted'
                      ? undefined
                      : onToggleVoidLine
                  }
                  filter={receiptFilter}
                  onFilterChange={setReceiptFilter}
                  routeLabel={
                    editableRepo
                      ? `${editableRepo.fullName} → ${mergeTargetLabel}`
                      : mergeTargetLabel
                  }
                  draftLabel={t('gitFlow.receipt.draftLabel', {
                    draft: draftName,
                  })}
                  hash={receiptHash}
                  hashLabel={hashLabel}
                  verdict={verdict}
                  stamp={stamp}
                />
              </Stack>

              <Box flexGrow={1} minHeight={0} overflowY="auto" px={4.5} py={4}>
                {isLoadingGitHubForkStatus && !githubForkStatus ? (
                  <HStack gap={2} color="mutedForeground">
                    <Spinner size="xs" />
                    <Text textStyle="body">
                      {t('glyphInspector.loadingForkBranch')}
                    </Text>
                  </HStack>
                ) : firstRunStage ? (
                  <FirstContributionPanel
                    stage={firstRunStage}
                    sourceRepoName={sourceRepo?.fullName ?? ''}
                    forkName={
                      editableRepo?.fullName ??
                      (githubViewer && sourceRepo
                        ? `${githubViewer.login}/${sourceRepo.repo}`
                        : null)
                    }
                    viewerLogin={githubViewer?.login ?? null}
                  />
                ) : (
                  <Stack gap={3.5}>
                    {githubViewer?.canPush === false ? (
                      // A read-only token authenticates fine and only fails at
                      // push time, so the panel has to say why sending is off.
                      <Stack
                        gap={2.5}
                        p={3.5}
                        borderWidth={1}
                        borderColor="orange.300"
                        borderRadius="md"
                        bg="orange.50"
                      >
                        <Text textStyle="supporting" color="orange.700">
                          {t('glyphInspector.missingPushScope', {
                            scopes: githubViewer?.scopes?.join(', ') || '—',
                          })}
                        </Text>
                        <Button
                          size="sm"
                          variant="outline"
                          alignSelf="flex-start"
                          onClick={onLoginGitHub}
                        >
                          {t('glyphInspector.reauthorizeGitHub')}
                        </Button>
                      </Stack>
                    ) : null}

                    {compare && compare.behindBy > 0 ? (
                      <HStack
                        justify="space-between"
                        gap={3}
                        px={3.5}
                        py={2.5}
                        borderRadius="md"
                        bg="blue.50"
                      >
                        <Text textStyle="supporting" color="blue.700">
                          {t('gitFlow.behind', { count: compare.behindBy })}
                        </Text>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={onMergeUpstream}
                          loading={isMergingGitHubUpstream}
                          flexShrink={0}
                        >
                          {t('gitFlow.updateFromTarget')}
                        </Button>
                      </HStack>
                    ) : null}

                    <SubmitWorkbench
                      state={workbenchState}
                      sendCount={sendCount}
                      conflictCount={changeReceipt.conflictCount}
                      forkRepoName={editableRepo?.fullName ?? null}
                      mergeTargetLabel={mergeTargetLabel}
                      draftName={draftName}
                      drafts={changeDrafts}
                      activeDraftRef={gitHubBranchName.trim()}
                      commitMessage={gitHubCommitMessage}
                      suggestedCommitMessage={suggestedCommitMessage}
                      isPreparing={isPreparingGitHubCommit}
                      errorMessage={submitErrorMessage}
                      proposal={proposal}
                      qualitySummary={qualitySummary}
                      isAdvancedOpen={isAdvancedOpen}
                      canPushDirect={Boolean(githubForkStatus?.canDirectCommit)}
                      conflictSlot={
                        <GitHubSyncSectionContainer
                          enabled={isSyncEnabled}
                          projectId={projectId}
                          onBlockingSyncConflictsChange={
                            onBlockingSyncConflictsChange
                          }
                        />
                      }
                      onAdvancedToggle={() =>
                        setIsAdvancedOpen((current) => !current)
                      }
                      onCommitMessageChange={onCommitMessageChange}
                      onSelectDraft={onSelectDraft}
                      onCreateDraft={onStartNewBranch}
                      onOpenQualityCheck={onOpenQualityCheck}
                      onReauthorize={onLoginGitHub}
                    />
                  </Stack>
                )}
              </Box>
            </Dialog.Body>

            <Dialog.Footer
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={3}
            >
              <Text fontFamily="mono" fontSize="11px" color="mutedForeground">
                {firstRunStage ? '' : footerMeta}
              </Text>
              <HStack gap={2}>
                <Button variant="ghost" onClick={onClose}>
                  {t('glyphInspector.cancel')}
                </Button>
                {firstRunStage ? (
                  <FirstContributionAction
                    stage={firstRunStage}
                    isBusy={isCreatingGitHubFork}
                    onSignIn={onLoginGitHub}
                    onCreateFork={onCreateFork}
                  />
                ) : (
                  <Button
                    onClick={
                      workbenchState === 'submitted'
                        ? () => {
                            if (lastSubmitResult?.compareUrl) {
                              window.open(
                                lastSubmitResult.compareUrl,
                                '_blank',
                                'noopener,noreferrer'
                              )
                            }
                          }
                        : onCreateCommit
                    }
                    loading={isCreatingGitHubCommit}
                    loadingText={t('glyphInspector.pushingCommit')}
                    disabled={
                      workbenchState === 'submitted' ? false : isSubmitBlocked
                    }
                  >
                    {primaryLabel}
                  </Button>
                )}
              </HStack>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
