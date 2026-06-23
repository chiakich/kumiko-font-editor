import {
  Badge,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
import {
  deriveOpenTypeSourceSectionRecords,
  type OpenTypeFeaturesState,
  type SourceSectionRecordGroup,
  type SourceSectionRecordSummary,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeatureSourcePanelProps {
  rawFeatureText: string
  state: OpenTypeFeaturesState
  onRawFeatureTextChange: (value: string) => void
}

export function FeatureSourcePanel({
  rawFeatureText,
  state,
  onRawFeatureTextChange,
}: FeatureSourcePanelProps) {
  const { t } = useTranslation()
  const sourceSectionRecords = deriveOpenTypeSourceSectionRecords(state)

  return (
    <Stack spacing={4}>
      <Stack spacing={2}>
        <Text fontWeight="semibold">{t('projectControl.source')}</Text>
        <Text fontSize="sm" color="field.muted">
          {t('projectControl.featureSourceDataFlow')}
        </Text>
      </Stack>

      <Stack spacing={2}>
        <Text fontSize="xs" color="field.muted">
          {t('projectControl.languageSystems')}
        </Text>
        <HStack wrap="wrap">
          {state.languagesystems.map((languageSystem) => (
            <Badge key={languageSystem.id} fontFamily="mono">
              {languageSystem.script} {languageSystem.language}
            </Badge>
          ))}
        </HStack>
      </Stack>

      <Stack spacing={2}>
        <Text fontSize="xs" color="field.muted">
          {t('projectControl.sourceSections')}
        </Text>
        {sourceSectionRecords.length > 0 ? (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
            {sourceSectionRecords.map((sectionRecords) => (
              <SourceSectionCard
                key={sectionRecords.section.id}
                recordsLabel={t('projectControl.records')}
                recordRefsLabel={t('projectControl.sourceRecordRefs')}
                sectionRecords={sectionRecords}
              />
            ))}
          </SimpleGrid>
        ) : (
          <Text fontSize="sm" color="field.muted">
            {t('projectControl.noSourceSections')}
          </Text>
        )}
      </Stack>

      <FormControl>
        <FormLabel fontSize="sm">
          {t('projectControl.rawFeatureText')}
        </FormLabel>
        <Textarea
          minH="180px"
          fontFamily="mono"
          value={rawFeatureText}
          onChange={(event) => onRawFeatureTextChange(event.target.value)}
          placeholder={t('projectControl.rawFeatureTextPlaceholder')}
        />
        <FormHelperText fontSize="xs">
          {t('projectControl.rawFeatureTextHelp')}
        </FormHelperText>
      </FormControl>
    </Stack>
  )
}

function SourceSectionCard({
  recordRefsLabel,
  recordsLabel,
  sectionRecords,
}: {
  recordRefsLabel: string
  recordsLabel: string
  sectionRecords: SourceSectionRecordGroup
}) {
  const { section, records } = sectionRecords
  const visibleRecords = records.slice(0, 10)
  const hiddenRecordRefCount = Math.max(
    records.length - visibleRecords.length,
    0
  )

  return (
    <Stack borderWidth="1px" borderRadius="sm" p={3} spacing={2}>
      <HStack justify="space-between" align="flex-start" gap={2}>
        <Stack spacing={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
            {section.title}
          </Text>
          <Text fontSize="xs" color="field.muted" noOfLines={1}>
            {section.path ?? section.table ?? section.format}
          </Text>
        </Stack>
        <Badge flexShrink={0}>{section.status}</Badge>
      </HStack>
      <HStack wrap="wrap" gap={2}>
        <Badge variant="subtle">{section.kind}</Badge>
        <Badge variant="subtle">{section.stage}</Badge>
        <Badge variant="subtle">{section.preservationPolicy}</Badge>
      </HStack>
      <Text fontSize="xs" color="field.muted">
        {sectionRecords.resolvedCount} / {section.recordRefs.length}{' '}
        {recordsLabel}
      </Text>
      {records.length > 0 ? (
        <Stack spacing={1}>
          <Text fontSize="xs" color="field.muted">
            {recordRefsLabel}
          </Text>
          <HStack wrap="wrap" gap={1}>
            {visibleRecords.map((record, index) => (
              <Badge
                key={`${record.kind}-${record.id}-${index}`}
                colorScheme={record.status === 'missing' ? 'red' : undefined}
                fontFamily="mono"
                title={record.detail}
                variant="outline"
              >
                {formatRecordSummary(record)}
              </Badge>
            ))}
            {hiddenRecordRefCount > 0 ? (
              <Badge variant="subtle">+{hiddenRecordRefCount}</Badge>
            ) : null}
          </HStack>
        </Stack>
      ) : null}
    </Stack>
  )
}

const formatRecordSummary = (record: SourceSectionRecordSummary) =>
  `${record.kind}${record.table ? ` ${record.table}` : ''}: ${record.label}`
