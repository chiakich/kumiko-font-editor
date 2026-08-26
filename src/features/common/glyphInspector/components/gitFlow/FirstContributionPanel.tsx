import { Box, Button, HStack, Spinner, Stack, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'

export type FirstContributionStage = 'signIn' | 'noFork' | 'creatingFork'

interface FirstContributionPanelProps {
  stage: FirstContributionStage
  sourceRepoName: string
  forkName: string | null
  viewerLogin: string | null
}

const CHECK = 'M4 12.5l5 5L20 6.5'

function Rung({
  index,
  activeIndex,
  title,
  detail,
  tag,
  isBusy,
}: {
  index: number
  activeIndex: number
  title: string
  detail: string
  tag: string
  isBusy: boolean
}) {
  const isDone = activeIndex > index
  const isCurrent = activeIndex === index

  return (
    <HStack align="stretch" gap={3}>
      <Stack align="center" width="22px" flexShrink={0} gap={0}>
        <Box
          className="corner-round"
          width="22px"
          height="22px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderWidth="1.5px"
          borderColor={
            isDone || isCurrent ? 'foreground' : 'controlBorderHover'
          }
          borderRadius="full"
          bg={isDone ? 'foreground' : isCurrent ? 'primary' : 'transparent'}
          color={isDone ? 'primary' : 'foreground'}
          flexShrink={0}
        >
          {isDone ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={CHECK} />
            </svg>
          ) : isCurrent && isBusy ? (
            <Spinner size="xs" borderWidth="2px" />
          ) : (
            <Box
              className="corner-round"
              width="4px"
              height="4px"
              borderRadius="full"
              bg={isCurrent ? 'primaryForeground' : 'haze'}
            />
          )}
        </Box>
        <Box
          flexGrow={1}
          width="1.5px"
          minHeight="14px"
          bg={isDone ? 'foreground' : 'controlBorder'}
        />
      </Stack>
      <Stack gap={1} pb={3.5} minWidth={0}>
        <HStack gap={2}>
          <Text
            textStyle="label"
            color={activeIndex >= index ? 'foreground' : 'haze'}
          >
            {title}
          </Text>
          <Text
            fontFamily="mono"
            px={1.5}
            py={0.5}
            borderRadius="sm"
            bg={isDone ? 'green.100' : isCurrent ? 'muted' : 'transparent'}
            color={isDone ? 'green.700' : 'mutedForeground'}
            fontSize="9px"
            fontWeight={600}
            letterSpacing="0.04em"
          >
            {tag}
          </Text>
        </HStack>
        <Text textStyle="supporting" color="mutedForeground">
          {detail}
        </Text>
      </Stack>
    </HStack>
  )
}

// The mode that exists only until a fork does. Once the copy is there the
// ordinary workbench takes over — the third rung says so rather than a footnote.
export function FirstContributionPanel({
  stage,
  sourceRepoName,
  forkName,
  viewerLogin,
}: FirstContributionPanelProps) {
  const { t } = useTranslation()
  const activeIndex = stage === 'signIn' ? 0 : stage === 'noFork' ? 1 : 2
  const isBusy = stage === 'creatingFork'

  const lede =
    stage === 'signIn'
      ? {
          bg: 'muted',
          title: t('gitFlow.firstRun.signInTitle'),
          body: t('gitFlow.firstRun.signInBody', { repo: sourceRepoName }),
        }
      : stage === 'noFork'
        ? {
            bg: 'blue.50',
            title: t('gitFlow.firstRun.noForkTitle', { repo: sourceRepoName }),
            body: t('gitFlow.firstRun.noForkBody'),
          }
        : {
            bg: 'blue.50',
            title: t('gitFlow.firstRun.creatingTitle', {
              repo: forkName ?? sourceRepoName,
            }),
            body: t('gitFlow.firstRun.creatingBody'),
          }

  return (
    <Stack gap={3.5}>
      <HStack
        align="flex-start"
        gap={2.5}
        p={3.5}
        borderRadius="md"
        bg={lede.bg}
      >
        <Box color="mutedForeground" mt="1px" flexShrink={0} aria-hidden="true">
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
            <path d="M12 8v.5M12 11v5" />
          </svg>
        </Box>
        <Stack gap={1} minWidth={0}>
          <Text textStyle="label">{lede.title}</Text>
          <Text textStyle="supporting" color="mutedForeground">
            {lede.body}
          </Text>
        </Stack>
      </HStack>

      <Stack gap={0} px={0.5} pt={1}>
        <Rung
          index={0}
          activeIndex={activeIndex}
          title={t('gitFlow.firstRun.rungSignIn')}
          detail={
            viewerLogin
              ? t('gitFlow.firstRun.rungSignInDone', { login: viewerLogin })
              : t('gitFlow.firstRun.rungSignInPending')
          }
          tag={
            activeIndex > 0
              ? t('gitFlow.firstRun.tagDone')
              : t('gitFlow.firstRun.tagNeedsYou')
          }
          isBusy={false}
        />
        <Rung
          index={1}
          activeIndex={activeIndex}
          title={t('gitFlow.firstRun.rungFork')}
          detail={t('gitFlow.firstRun.rungForkDetail', {
            repo: forkName ?? t('gitFlow.firstRun.yourCopyFallback'),
          })}
          tag={
            activeIndex > 1
              ? t('gitFlow.firstRun.tagDone')
              : t('gitFlow.firstRun.tagAutomatic')
          }
          isBusy={isBusy}
        />
        <Rung
          index={2}
          activeIndex={activeIndex}
          title={t('gitFlow.firstRun.rungHandover')}
          detail={t('gitFlow.firstRun.rungHandoverDetail')}
          tag={t('gitFlow.firstRun.tagNext')}
          isBusy={false}
        />
      </Stack>
    </Stack>
  )
}

export function FirstContributionAction({
  stage,
  isBusy,
  onSignIn,
  onCreateFork,
}: {
  stage: FirstContributionStage
  isBusy: boolean
  onSignIn: () => void
  onCreateFork: () => void
}) {
  const { t } = useTranslation()

  if (stage === 'signIn') {
    return (
      <Button onClick={onSignIn}>{t('gitFlow.firstRun.signInAction')}</Button>
    )
  }

  return (
    <Button
      onClick={onCreateFork}
      loading={isBusy}
      loadingText={t('gitFlow.firstRun.creatingAction')}
    >
      {t('gitFlow.firstRun.createForkAction')}
    </Button>
  )
}
