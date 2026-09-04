import {
  Box,
  Button,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { GitBranch } from 'iconoir-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GitHubForkStatus } from '@/lib/github/githubAuth'
import type { GitHubSyncTarget } from '@/lib/github/sync/types'

export interface ProjectVersionMenuProps {
  activeTarget: GitHubSyncTarget | null
  changeDrafts: GitHubSyncTarget[]
  forkStatus: GitHubForkStatus | null
  isSwitching: boolean
  onSwitchToDraft: (ref: string) => void
  onSwitchToMergeTarget: () => void
}

interface VersionRow {
  key: string
  ref: string
  detail: string
  isReadOnly: boolean
  isActive: boolean
  onSwitch: () => void
}

// Switching versions reloads the whole project — it changes what you are
// editing, which is why it lives in the project chrome and not in the submit
// panel, and why it asks before it runs.
export function ProjectVersionMenu({
  activeTarget,
  changeDrafts,
  forkStatus,
  isSwitching,
  onSwitchToDraft,
  onSwitchToMergeTarget,
}: ProjectVersionMenuProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const sourceRepo = forkStatus?.sourceRepo ?? null
  const isViewingMergeTarget = Boolean(
    activeTarget &&
    sourceRepo &&
    activeTarget.owner === sourceRepo.owner &&
    activeTarget.repo === sourceRepo.repo &&
    activeTarget.ref === sourceRepo.defaultBranch
  )

  const draftRows: VersionRow[] = changeDrafts.map((draft) => ({
    key: `draft:${draft.owner}/${draft.repo}:${draft.ref}`,
    ref: draft.ref,
    detail: t('gitFlow.version.draftDetail'),
    isReadOnly: false,
    isActive: Boolean(
      activeTarget &&
      activeTarget.owner === draft.owner &&
      activeTarget.repo === draft.repo &&
      activeTarget.ref === draft.ref
    ),
    onSwitch: () => onSwitchToDraft(draft.ref),
  }))

  const projectRows: VersionRow[] = sourceRepo
    ? [
        {
          key: 'merge-target',
          ref: `${sourceRepo.fullName} · ${sourceRepo.defaultBranch}`,
          // Write access is the repo's own answer: on your own project the
          // development version is editable, not read-only.
          detail: sourceRepo.canPush
            ? t('gitFlow.version.mergeTargetWritableDetail')
            : t('gitFlow.version.mergeTargetDetail'),
          isReadOnly: !sourceRepo.canPush,
          isActive: isViewingMergeTarget,
          onSwitch: onSwitchToMergeTarget,
        },
      ]
    : []

  // The loaded version is not always a draft or the merge target — a project
  // imported from another branch is neither — and it still has to be named.
  const listedRows = [...draftRows, ...projectRows]
  const unlistedActiveRow: VersionRow[] =
    !listedRows.some((row) => row.isActive) && activeTarget
      ? [
          {
            key: 'active',
            ref: activeTarget.ref,
            detail: t('gitFlow.version.activeDetail'),
            isReadOnly: false,
            isActive: true,
            onSwitch: () => undefined,
          },
        ]
      : []
  const rows = [...unlistedActiveRow, ...listedRows]
  const activeRow = rows.find((row) => row.isActive) ?? null
  const pendingRow = rows.find((row) => row.key === pendingKey) ?? null
  const chipLabel = activeRow?.ref ?? t('gitFlow.version.unknown')

  const sections = [
    {
      label: t('gitFlow.version.myDrafts'),
      rows: [...unlistedActiveRow, ...draftRows],
    },
    { label: t('gitFlow.version.projectVersions'), rows: projectRows },
  ].filter((section) => section.rows.length > 0)

  return (
    <Popover.Root
      open={isOpen}
      onOpenChange={(event) => {
        setIsOpen(event.open)
        setPendingKey(null)
      }}
      positioning={{ placement: 'bottom-start' }}
    >
      <Tooltip content={t('gitFlow.version.tooltip', { ref: chipLabel })}>
        <Popover.Trigger asChild>
          <IconButton
            aria-label={t('gitFlow.version.openMenu')}
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="foreground"
            loading={isSwitching}
            _hover={{ bg: 'foreground', color: 'background' }}
          >
            <GitBranch
              width={18}
              height={18}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          </IconButton>
        </Popover.Trigger>
      </Tooltip>
      <Portal>
        <Popover.Positioner>
          <Popover.Content width="372px" p={1}>
            <Stack gap={0}>
              {sections.map((section) => (
                <Stack key={section.label} gap={0}>
                  <Text
                    px={2}
                    pt={2}
                    pb={1}
                    textStyle="caps"
                    color="mutedForeground"
                  >
                    {section.label}
                  </Text>
                  {section.rows.map((row) => (
                    <Box
                      key={row.key}
                      as="button"
                      onClick={() =>
                        setPendingKey(row.isActive ? null : row.key)
                      }
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      gap={2.5}
                      p={2}
                      border="none"
                      borderRadius="sm"
                      bg={
                        pendingKey === row.key
                          ? 'blue.50'
                          : row.isActive
                            ? 'muted'
                            : 'transparent'
                      }
                      textAlign="left"
                      cursor={row.isActive ? 'default' : 'pointer'}
                      _hover={row.isActive ? undefined : { bg: 'muted' }}
                    >
                      <HStack gap={2} minWidth={0}>
                        <Box
                          color={row.isActive ? 'foreground' : 'transparent'}
                          aria-hidden="true"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 12.5l5 5L20 6.5" />
                          </svg>
                        </Box>
                        <Stack gap={0.5} minWidth={0}>
                          <Text
                            fontFamily="mono"
                            fontSize="xs"
                            fontWeight={600}
                            lineClamp={1}
                          >
                            {row.ref}
                          </Text>
                          <Text fontSize="11px" color="mutedForeground">
                            {row.detail}
                          </Text>
                        </Stack>
                      </HStack>
                      <Text
                        fontFamily="mono"
                        px={1.5}
                        py={0.5}
                        borderRadius="sm"
                        bg={
                          row.isActive
                            ? 'primary'
                            : row.isReadOnly
                              ? 'muted'
                              : 'green.100'
                        }
                        color={
                          row.isActive
                            ? 'primaryForeground'
                            : row.isReadOnly
                              ? 'mutedForeground'
                              : 'green.700'
                        }
                        fontSize="9px"
                        fontWeight={600}
                        letterSpacing="0.04em"
                        flexShrink={0}
                      >
                        {row.isActive
                          ? t('gitFlow.version.editing')
                          : row.isReadOnly
                            ? t('gitFlow.version.readOnly')
                            : t('gitFlow.version.editable')}
                      </Text>
                    </Box>
                  ))}
                </Stack>
              ))}

              {rows.length === 0 ? (
                <Text p={2} textStyle="supporting" color="mutedForeground">
                  {t('gitFlow.version.noVersions')}
                </Text>
              ) : null}

              {pendingRow ? (
                <Stack
                  gap={2}
                  mt={1.5}
                  p={2.5}
                  borderTopWidth={1}
                  borderColor="controlBorder"
                  borderRadius="sm"
                  bg="orange.50"
                >
                  <HStack align="flex-start" gap={2}>
                    <Box
                      color="orange.600"
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
                        <path d="M12 8v5M12 16.5v.5" />
                      </svg>
                    </Box>
                    <Text textStyle="supporting" color="orange.700">
                      {t('gitFlow.version.confirmReload', {
                        ref: pendingRow.ref,
                      })}
                    </Text>
                  </HStack>
                  <HStack justify="flex-end" gap={1.5}>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setPendingKey(null)}
                    >
                      {t('glyphInspector.cancel')}
                    </Button>
                    <Button
                      size="xs"
                      loading={isSwitching}
                      onClick={() => {
                        pendingRow.onSwitch()
                        setPendingKey(null)
                        setIsOpen(false)
                      }}
                    >
                      {t('gitFlow.version.confirmSwitch')}
                    </Button>
                  </HStack>
                </Stack>
              ) : null}
            </Stack>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  )
}
