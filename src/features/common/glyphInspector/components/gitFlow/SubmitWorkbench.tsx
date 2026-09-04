import type { ReactNode } from 'react'
import {
  Box,
  Button,
  HStack,
  Link,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type { GitHubSyncTarget } from '@/lib/github/sync/types'
import type { QualitySummary } from '@/lib/qualityCheck/qualityLint'

export type WorkbenchState =
  | 'ready'
  | 'conflict'
  | 'empty'
  | 'submitted'
  | 'failed'

export interface WorkbenchProposal {
  title: string
  body: string
  url: string | null
}

interface SubmitWorkbenchProps {
  state: WorkbenchState
  sendCount: number
  conflictCount: number
  forkRepoName: string | null
  mergeTargetLabel: string
  draftName: string
  drafts: GitHubSyncTarget[]
  activeDraftRef: string
  commitMessage: string
  suggestedCommitMessage: string
  isPreparing: boolean
  errorMessage: string | null
  proposal: WorkbenchProposal | null
  qualitySummary?: QualitySummary
  isAdvancedOpen: boolean
  canPushDirect: boolean
  conflictSlot?: ReactNode
  onAdvancedToggle: () => void
  onCommitMessageChange: (value: string) => void
  onSelectDraft: (ref: string) => void
  onCreateDraft: () => void
  onOpenQualityCheck?: () => void
  onReauthorize: () => void
}

const toneFor = (state: WorkbenchState) => {
  switch (state) {
    case 'conflict':
      return { bg: 'orange.50', dot: 'orange.400' }
    case 'failed':
      return { bg: 'red.50', dot: 'destructive' }
    case 'empty':
      return { bg: 'muted', dot: 'haze' }
    case 'submitted':
      return { bg: 'green.50', dot: 'success' }
    default:
      return { bg: 'muted', dot: 'success' }
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text textStyle="caps" color="mutedForeground">
      {children}
    </Text>
  )
}

export function SubmitWorkbench({
  state,
  sendCount,
  conflictCount,
  forkRepoName,
  mergeTargetLabel,
  draftName,
  drafts,
  activeDraftRef,
  commitMessage,
  suggestedCommitMessage,
  isPreparing,
  errorMessage,
  proposal,
  qualitySummary,
  isAdvancedOpen,
  canPushDirect,
  conflictSlot,
  onAdvancedToggle,
  onCommitMessageChange,
  onSelectDraft,
  onCreateDraft,
  onOpenQualityCheck,
  onReauthorize,
}: SubmitWorkbenchProps) {
  const { t } = useTranslation()
  const tone = toneFor(state)
  const showSubmitControls = state !== 'empty' && state !== 'submitted'
  const headline =
    state === 'conflict'
      ? t('gitFlow.status.conflictHeadline', { count: conflictCount })
      : state === 'empty'
        ? t('gitFlow.status.emptyHeadline')
        : state === 'failed'
          ? t('gitFlow.status.failedHeadline')
          : state === 'submitted'
            ? t('gitFlow.status.submittedHeadline', { count: sendCount })
            : t('gitFlow.status.readyHeadline', { count: sendCount })
  const hint =
    state === 'conflict'
      ? t('gitFlow.status.conflictHint')
      : state === 'empty'
        ? t('gitFlow.status.emptyHint')
        : state === 'failed'
          ? t('gitFlow.status.failedHint')
          : state === 'submitted'
            ? t('gitFlow.status.submittedHint')
            : t('gitFlow.status.readyHint')

  return (
    <Stack gap={3.5}>
      {state === 'failed' && errorMessage ? (
        <Stack
          gap={2.5}
          p={3.5}
          borderWidth={1}
          borderColor="destructive"
          borderRadius="md"
          bg="red.50"
        >
          <HStack align="flex-start" gap={2.5}>
            <Box color="red.600" mt="1px" flexShrink={0} aria-hidden="true">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16.5v.5" />
              </svg>
            </Box>
            <Stack gap={1} minWidth={0}>
              <Text textStyle="label" color="red.700">
                {t('gitFlow.failure.title')}
              </Text>
              <Text textStyle="supporting" color="red.700">
                {t('gitFlow.failure.body', { count: sendCount })}
              </Text>
            </Stack>
          </HStack>
          <Text
            fontFamily="mono"
            px={2.5}
            py={2}
            borderRadius="sm"
            bg="red.100"
            color="red.700"
            fontSize="11px"
            lineHeight="relaxed"
            overflowX="auto"
          >
            {errorMessage}
          </Text>
          <HStack gap={2}>
            <Button size="sm" colorPalette="red" onClick={onReauthorize}>
              {t('gitFlow.failure.reauthorize')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(errorMessage)}
            >
              {t('gitFlow.failure.copy')}
            </Button>
          </HStack>
        </Stack>
      ) : null}

      <HStack align="flex-start" gap={2} p={3.5} borderRadius="md" bg={tone.bg}>
        <Box
          className="corner-round"
          width="8px"
          height="8px"
          mt="5px"
          borderRadius="full"
          bg={tone.dot}
          flexShrink={0}
        />
        <Stack gap={1} minWidth={0}>
          <Text textStyle="label">{headline}</Text>
          <Text textStyle="supporting" color="mutedForeground">
            {hint}
          </Text>
        </Stack>
      </HStack>

      {conflictSlot}

      {proposal ? (
        <Stack
          gap={2.5}
          p={3.5}
          borderWidth={1}
          borderColor={state === 'submitted' ? 'border' : 'controlBorder'}
          borderRadius="md"
          bg={state === 'submitted' ? 'background' : 'transparent'}
        >
          <HStack justify="space-between" gap={3}>
            <HStack gap={2}>
              <Text
                fontFamily="mono"
                px={1.5}
                py={0.5}
                borderRadius="sm"
                bg="green.100"
                color="green.700"
                fontSize="10px"
                fontWeight={600}
              >
                {t('gitFlow.proposal.inReview')}
              </Text>
              <Text textStyle="label">{proposal.title}</Text>
            </HStack>
            {proposal.url ? (
              <Link
                href={proposal.url}
                target="_blank"
                rel="noopener noreferrer"
                fontSize="xs"
                fontWeight={700}
              >
                {t('gitFlow.proposal.viewOnGitHub')}
              </Link>
            ) : null}
          </HStack>
          <Text textStyle="supporting" color="mutedForeground">
            {proposal.body}
          </Text>
          {state === 'submitted' ? (
            <HStack
              justify="space-between"
              gap={3}
              pt={2.5}
              borderTopWidth={1}
              borderColor="controlBorder"
            >
              <Stack gap={0.5} minWidth={0}>
                <Text textStyle="supporting" color="mutedForeground">
                  {t('gitFlow.proposal.messageIs')}
                </Text>
                <Text fontFamily="mono" fontSize="xs" lineClamp={1}>
                  {commitMessage || suggestedCommitMessage}
                </Text>
              </Stack>
              <Button size="xs" variant="outline" onClick={onAdvancedToggle}>
                {t('gitFlow.proposal.addMessage')}
              </Button>
            </HStack>
          ) : null}
        </Stack>
      ) : null}

      {showSubmitControls ? (
        <Stack gap={1.5}>
          <Text textStyle="label">{t('gitFlow.message.label')}</Text>
          <Textarea
            value={commitMessage}
            placeholder={suggestedCommitMessage}
            disabled={isPreparing}
            fontFamily="mono"
            height="68px"
            resize="none"
            onChange={(event) => onCommitMessageChange(event.target.value)}
          />
        </Stack>
      ) : null}

      {qualitySummary ? (
        <HStack
          justify="space-between"
          gap={3}
          px={3}
          py={2.5}
          borderWidth={1}
          borderColor="controlBorder"
          borderRadius="md"
        >
          <Stack gap={0.5}>
            <HStack gap={1.5}>
              <Box
                color={
                  qualitySummary.hasBlockingIssues ? 'red.600' : 'green.600'
                }
                aria-hidden="true"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12.5l5 5L20 6.5" />
                </svg>
              </Box>
              <Text fontSize="xs" fontWeight={600}>
                {t('qualityCheck.commit.title')}
              </Text>
            </HStack>
            <Text fontSize="11px" color="mutedForeground">
              {state === 'empty'
                ? t('gitFlow.checks.nothingToCheck')
                : t('gitFlow.checks.qualityDetail', {
                    blocking: qualitySummary.blockingCount,
                    warning: qualitySummary.warningCount,
                  })}
            </Text>
          </Stack>
          {onOpenQualityCheck ? (
            <Button size="xs" variant="ghost" onClick={onOpenQualityCheck}>
              {t('qualityCheck.openShort')}
            </Button>
          ) : null}
        </HStack>
      ) : null}

      {showSubmitControls ? (
        <Stack
          gap={2.5}
          p={3.5}
          borderWidth={1}
          borderColor="border"
          borderRadius="md"
          bg="background"
        >
          <SectionLabel>{t('gitFlow.route.label')}</SectionLabel>
          <Text textStyle="body" lineHeight="relaxed">
            {t('gitFlow.route.sentence', {
              count: sendCount,
              draft: draftName,
              target: mergeTargetLabel,
            })}
          </Text>
          <Text textStyle="supporting" color="mutedForeground">
            {t('gitFlow.route.explainer', {
              fork: forkRepoName ?? t('gitFlow.firstRun.yourCopyFallback'),
            })}
          </Text>
        </Stack>
      ) : null}

      <Stack
        gap={0}
        borderWidth={1}
        borderColor="controlBorder"
        borderRadius="md"
        overflow="hidden"
      >
        <Box
          as="button"
          onClick={onAdvancedToggle}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={3}
          px={3}
          py={2.5}
          border="none"
          bg="transparent"
          textAlign="left"
          cursor="pointer"
          aria-expanded={isAdvancedOpen}
        >
          <HStack gap={2}>
            <Text fontSize="xs" fontWeight={600}>
              {t('gitFlow.advanced.title')}
            </Text>
            <Text fontFamily="mono" fontSize="11px" color="mutedForeground">
              {t('gitFlow.advanced.summary', { count: drafts.length })}
            </Text>
          </HStack>
          <Box
            color="mutedForeground"
            transform={isAdvancedOpen ? 'rotate(180deg)' : undefined}
            aria-hidden="true"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </Box>
        </Box>

        {isAdvancedOpen ? (
          <Stack gap={3} px={3} pb={3} pt={0.5}>
            <Stack gap={1.5}>
              <SectionLabel>{t('gitFlow.advanced.draftsLabel')}</SectionLabel>
              {drafts.length === 0 ? (
                <Text textStyle="supporting" color="mutedForeground">
                  {t('gitFlow.advanced.noDrafts')}
                </Text>
              ) : null}
              {drafts.map((draft) => {
                const isActive = draft.ref === activeDraftRef
                return (
                  <HStack
                    key={`${draft.owner}/${draft.repo}:${draft.ref}`}
                    justify="space-between"
                    gap={2.5}
                    px={2.5}
                    py={2}
                    borderWidth={1}
                    borderColor={isActive ? 'border' : 'controlBorder'}
                    borderRadius="md"
                    bg={isActive ? 'background' : 'transparent'}
                  >
                    <Text fontFamily="mono" fontSize="xs" lineClamp={1}>
                      {draft.ref}
                    </Text>
                    <Button
                      size="xs"
                      variant={isActive ? 'solid' : 'outline'}
                      disabled={isActive}
                      onClick={() => onSelectDraft(draft.ref)}
                      flexShrink={0}
                    >
                      {isActive
                        ? t('gitFlow.advanced.sendsHere')
                        : t('gitFlow.advanced.sendHereInstead')}
                    </Button>
                  </HStack>
                )
              })}
              <Button size="sm" variant="outline" onClick={onCreateDraft}>
                {t('gitFlow.advanced.newDraft')}
              </Button>
            </Stack>

            <HStack align="flex-start" gap={2}>
              <Box
                width="16px"
                height="16px"
                mt="1px"
                borderWidth="1.5px"
                borderColor="controlBorderHover"
                borderRadius="sm"
                bg="muted"
                flexShrink={0}
                aria-hidden="true"
              />
              <Stack gap={0.5}>
                <Text fontSize="xs" color="haze">
                  {t('gitFlow.advanced.directPush', {
                    target: mergeTargetLabel,
                  })}
                </Text>
                <Text fontSize="11px" color="mutedForeground">
                  {canPushDirect
                    ? t('gitFlow.advanced.directPushAvailable')
                    : t('gitFlow.advanced.directPushDenied')}
                </Text>
              </Stack>
            </HStack>

            <HStack
              align="flex-start"
              gap={2}
              pt={2.5}
              borderTopWidth={1}
              borderColor="controlBorder"
            >
              <Box
                color="mutedForeground"
                mt="1px"
                flexShrink={0}
                aria-hidden="true"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v.5M12 11v5" />
                </svg>
              </Box>
              <Text
                fontSize="11px"
                lineHeight="relaxed"
                color="mutedForeground"
              >
                {t('gitFlow.advanced.switchVersionPointer')}
              </Text>
            </HStack>
          </Stack>
        ) : null}
      </Stack>
    </Stack>
  )
}
