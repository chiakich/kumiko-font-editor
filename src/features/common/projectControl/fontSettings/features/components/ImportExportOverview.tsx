import { Badge, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import {
  deriveOpenTypeImportExportSummary,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface ImportExportOverviewProps {
  state: OpenTypeFeaturesState
}

export function ImportExportOverview({ state }: ImportExportOverviewProps) {
  const { t } = useTranslation()

  const summary = deriveOpenTypeImportExportSummary(state)

  return (
    <Stack spacing={3}>
      <HStack justify="space-between" align="flex-start" gap={3}>
        <Stack spacing={1}>
          <Text fontWeight="semibold">
            {t('projectControl.behaviorLibraryExportView')}
          </Text>
          <Text fontSize="sm" color="field.muted">
            {t('projectControl.importedTablesAreTreatedAsPreserved')}
          </Text>
        </Stack>
        <Badge colorScheme="cyan" flexShrink={0}>
          {summary.exportModeLabel}
        </Badge>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
        <OverviewTile
          accent="Imported"
          detail={`${summary.importedFeatures} features / ${summary.importedLookups} lookups`}
          label={t('projectControl.recognized')}
          value={summary.importedRules}
        />
        <OverviewTile
          accent="Manual"
          detail={`${summary.manualFeatures} features / ${summary.manualLookups} lookups`}
          label={t('projectControl.editable')}
          value={summary.manualRules}
        />
        <OverviewTile
          accent="Generated"
          detail={`${summary.generatedLookups} lookups`}
          label={t('projectControl.auto')}
          value={summary.generatedRules}
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
        <StatusLine
          label={t('projectControl.editableLookups')}
          value={summary.editableLookups}
        />
        <StatusLine
          label={t('projectControl.preservedRawLookups')}
          value={summary.preservedLookups}
        />
        <StatusLine
          label={t('projectControl.unsupportedLookups')}
          value={summary.unsupportedLookups}
          tone={summary.unsupportedLookups > 0 ? 'orange' : 'gray'}
        />
      </SimpleGrid>

      <Text fontSize="sm" color="field.muted">
        {summary.exportModeDescription}
      </Text>
    </Stack>
  )
}

function OverviewTile({
  accent,
  detail,
  label,
  value,
}: {
  accent: string
  detail: string
  label: string
  value: number
}) {
  return (
    <Stack borderWidth="1px" borderRadius="sm" p={3} spacing={2}>
      <HStack justify="space-between">
        <Text fontSize="xs" color="field.muted">
          {label}
        </Text>
        <Badge variant="subtle">{accent}</Badge>
      </HStack>
      <Text fontSize="2xl" fontWeight="900">
        {value}
      </Text>
      <Text fontSize="xs" color="field.muted">
        {detail}
      </Text>
    </Stack>
  )
}

function StatusLine({
  label,
  tone = 'gray',
  value,
}: {
  label: string
  tone?: string
  value: number
}) {
  return (
    <HStack
      justify="space-between"
      borderWidth="1px"
      borderRadius="sm"
      px={3}
      py={2}
    >
      <Text fontSize="sm" color="field.muted">
        {label}
      </Text>
      <Badge colorScheme={tone}>{value}</Badge>
    </HStack>
  )
}
