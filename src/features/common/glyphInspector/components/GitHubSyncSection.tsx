import { toaster } from '@/components/ui/toaster'
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
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type {
  GlyphSyncEntry,
  ProjectSyncReport,
  SyncConflictResolution,
} from 'src/lib/github/sync'
import { projectSyncDirtyStatusQueryKey } from 'src/features/common/glyphInspector/hooks/useProjectSyncDirtyStatus'
import { useGitHubSyncStatus } from 'src/features/common/glyphInspector/hooks/useGitHubSyncStatus'

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

interface GitHubSyncSectionContainerProps {
  enabled: boolean
  projectId: string | null
  onBlockingSyncConflictsChange: (hasBlockingSyncConflicts: boolean) => void
}

export function GitHubSyncSectionContainer({
  enabled,
  projectId,
  onBlockingSyncConflictsChange,
}: GitHubSyncSectionContainerProps) {
  const queryClient = useQueryClient()
  const syncStatus = useGitHubSyncStatus({ projectId, enabled })
  const hasBlockingSyncConflicts = Boolean(
    syncStatus.report && syncStatus.report.conflicts.length > 0
  )

  useEffect(() => {
    onBlockingSyncConflictsChange(hasBlockingSyncConflicts)
  }, [hasBlockingSyncConflicts, onBlockingSyncConflictsChange])

  const handleApplyRemoteSync = async () => {
    try {
      const result = await syncStatus.applyRemote()
      void queryClient.invalidateQueries({
        queryKey: projectSyncDirtyStatusQueryKey(projectId),
      })
      toaster.create({
        title: '已套用遠端更新',
        description: `更新了 ${result.appliedCount} 個檔案。`,
        type: 'success',
        duration: 3200,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: '套用遠端更新失敗',
        description:
          error instanceof Error ? error.message : '目前無法套用遠端更新。',
        type: 'error',
        duration: 4200,
        closable: true,
      })
    }
  }

  return (
    <GitHubSyncSection
      isLoading={syncStatus.isLoading}
      errorMessage={syncStatus.errorMessage}
      report={syncStatus.report}
      resolutions={syncStatus.resolutions}
      isApplying={syncStatus.isApplying}
      unresolvedConflictCount={syncStatus.unresolvedConflictCount}
      onResolutionChange={syncStatus.setResolution}
      onApplyRemote={() => void handleApplyRemoteSync()}
    />
  )
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
    <HStack justify="space-between" gap={3}>
      <HStack gap={2} minWidth={0}>
        <Text fontSize="sm" fontWeight="medium" lineClamp={1}>
          {entry.glyphName ?? entry.fileName}
        </Text>
        {entry.remoteSha === null ? (
          <Badge colorPalette="red">
            {t('glyphInspector.syncRemoteDeleted')}
          </Badge>
        ) : null}
      </HStack>
      <ButtonGroup size="xs" attached variant="outline">
        <Button
          data-active={resolution === 'keepLocal' ? '' : undefined}
          onClick={() => onResolutionChange(entry.path, 'keepLocal')}
        >
          {t('glyphInspector.syncKeepLocal')}
        </Button>
        <Button
          data-active={resolution === 'takeRemote' ? '' : undefined}
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
      <HStack gap={2} color="mutedForeground">
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
      <Stack gap={3}>
        {hasRemoteChanges ? (
          <Text fontSize="sm" color="blue.600">
            {t('glyphInspector.syncRemoteChanges', {
              count: report.remoteChanges.length,
            })}
          </Text>
        ) : null}

        {hasConflicts ? (
          <Stack gap={2}>
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
          <Text fontSize="xs" color="mutedForeground">
            {report.target.owner}/{report.target.repo}@{report.target.ref}
          </Text>
          <Button
            size="sm"
            colorPalette={hasConflicts ? 'orange' : 'blue'}
            onClick={onApplyRemote}
            loading={isApplying}
            disabled={hasConflicts && unresolvedConflictCount > 0}
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
