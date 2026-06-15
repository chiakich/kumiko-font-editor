import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  HStack,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type {
  GlyphSyncEntry,
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync'

export interface GitHubSyncSectionProps {
  isLoading: boolean
  errorMessage: string | null
  report: ProjectSyncReport | null
  resolutions: Record<string, SyncConflictResolution>
  isApplying: boolean
  unresolvedConflictCount: number
  onResolutionChange: (path: string, resolution: SyncConflictResolution) => void
  onApplyRemote: () => void
}

const shortSha = (sha: string) => sha.slice(0, 7)

function ConflictRow({
  entry,
  resolution,
  onResolutionChange,
}: {
  entry: GlyphSyncEntry
  resolution: SyncConflictResolution | undefined
  onResolutionChange: (path: string, resolution: SyncConflictResolution) => void
}) {
  const { t } = useTranslation()

  return (
    <HStack justify="space-between" spacing={3}>
      <HStack spacing={2} minWidth={0}>
        <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
          {entry.glyphName ?? entry.fileName}
        </Text>
        {entry.remoteSha === null ? (
          <Badge colorScheme="red">
            {t('glyphInspector.syncRemoteDeleted')}
          </Badge>
        ) : null}
      </HStack>
      <ButtonGroup size="xs" isAttached variant="outline">
        <Button
          isActive={resolution === 'keepLocal'}
          onClick={() => onResolutionChange(entry.path, 'keepLocal')}
        >
          {t('glyphInspector.syncKeepLocal')}
        </Button>
        <Button
          isActive={resolution === 'takeRemote'}
          onClick={() => onResolutionChange(entry.path, 'takeRemote')}
        >
          {t('glyphInspector.syncTakeRemote')}
        </Button>
      </ButtonGroup>
    </HStack>
  )
}

export function GitHubSyncSection({
  isLoading,
  errorMessage,
  report,
  resolutions,
  isApplying,
  unresolvedConflictCount,
  onResolutionChange,
  onApplyRemote,
}: GitHubSyncSectionProps) {
  const { t } = useTranslation()

  if (isLoading && !report) {
    return (
      <HStack spacing={2} color="gray.500">
        <Spinner size="xs" />
        <Text fontSize="sm">{t('glyphInspector.syncChecking')}</Text>
      </HStack>
    )
  }

  if (errorMessage) {
    return (
      <Box borderWidth={1} borderRadius="lg" p={3} borderColor="orange.200">
        <Text fontSize="sm" color="orange.600">
          {t('glyphInspector.syncCheckFailed', { message: errorMessage })}
        </Text>
      </Box>
    )
  }

  if (!report) {
    return null
  }

  if (report.isUpToDate) {
    return (
      <Box borderWidth={1} borderRadius="lg" p={3} borderColor="green.200">
        <Text fontSize="sm" color="green.600">
          {t('glyphInspector.syncUpToDate', {
            ref: report.target.ref,
            sha: shortSha(report.remoteHeadSha),
          })}
        </Text>
      </Box>
    )
  }

  const hasRemoteChanges = report.remoteChanges.length > 0
  const hasConflicts = report.conflicts.length > 0

  return (
    <Box
      borderWidth={1}
      borderRadius="lg"
      p={3}
      borderColor={hasConflicts ? 'orange.300' : 'blue.200'}
    >
      <Stack spacing={3}>
        {hasRemoteChanges ? (
          <Text fontSize="sm" color="blue.600">
            {t('glyphInspector.syncRemoteChanges', {
              count: report.remoteChanges.length,
            })}
          </Text>
        ) : null}

        {hasConflicts ? (
          <Stack spacing={2}>
            <Text fontSize="sm" fontWeight="medium" color="orange.600">
              {t('glyphInspector.syncConflicts', {
                count: report.conflicts.length,
              })}
            </Text>
            {report.conflicts.map((entry) => (
              <ConflictRow
                key={entry.path}
                entry={entry}
                resolution={resolutions[entry.path]}
                onResolutionChange={onResolutionChange}
              />
            ))}
          </Stack>
        ) : null}

        <HStack justify="space-between">
          <Text fontSize="xs" color="gray.500">
            {report.target.owner}/{report.target.repo}@{report.target.ref}
          </Text>
          <Button
            size="sm"
            colorScheme={hasConflicts ? 'orange' : 'blue'}
            onClick={onApplyRemote}
            isLoading={isApplying}
            isDisabled={hasConflicts && unresolvedConflictCount > 0}
          >
            {t('glyphInspector.syncApplyRemote')}
          </Button>
        </HStack>

        {hasConflicts && unresolvedConflictCount > 0 ? (
          <Text fontSize="xs" color="orange.600">
            {t('glyphInspector.syncResolveFirst', {
              count: unresolvedConflictCount,
            })}
          </Text>
        ) : null}
      </Stack>
    </Box>
  )
}
