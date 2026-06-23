import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type {
  FeatureSourceSection,
  SourceSectionRecordGroup,
  SourceSectionRecordSummary,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface SourceReferenceSummaryProps {
  sourceSectionRecords: SourceSectionRecordGroup[]
}

export function SourceReferenceSummary({
  sourceSectionRecords,
}: SourceReferenceSummaryProps) {
  const { t } = useTranslation()

  if (sourceSectionRecords.length === 0) {
    return null
  }

  return (
    <Stack spacing={2}>
      <Text fontSize="xs" color="field.muted">
        {t('projectControl.sourceSections')}
      </Text>
      <Stack spacing={2}>
        {sourceSectionRecords.map((sourceSectionRecord) => (
          <SourceReferenceCard
            key={sourceSectionRecord.section.id}
            sourceSectionRecord={sourceSectionRecord}
          />
        ))}
      </Stack>
    </Stack>
  )
}

function SourceReferenceCard({
  sourceSectionRecord,
}: {
  sourceSectionRecord: SourceSectionRecordGroup
}) {
  const { records, resolvedCount, missingCount, section } = sourceSectionRecord
  const visibleRecords = records.slice(0, 4)
  const hiddenCount = Math.max(records.length - visibleRecords.length, 0)

  return (
    <Stack spacing={2} borderTopWidth="1px" pt={2}>
      <HStack justify="space-between" align="flex-start" gap={2}>
        <Stack spacing={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
            {section.title}
          </Text>
          <HStack wrap="wrap" gap={1}>
            {section.table ? <Badge>{section.table}</Badge> : null}
            <Badge variant="subtle">{section.status}</Badge>
            <Badge variant="outline">{section.preservationPolicy}</Badge>
          </HStack>
        </Stack>
        <Badge flexShrink={0} variant={missingCount > 0 ? 'solid' : 'subtle'}>
          {resolvedCount}/{records.length}
        </Badge>
      </HStack>
      <HStack wrap="wrap" gap={1}>
        {formatSectionMeta(section).map((badge) => (
          <Badge key={badge} fontFamily="mono" variant="outline">
            {badge}
          </Badge>
        ))}
      </HStack>
      {visibleRecords.length > 0 ? (
        <Stack spacing={1}>
          {visibleRecords.map((record, index) => (
            <SourceRecordLine
              key={`${record.kind}-${record.id}-${index}`}
              record={record}
            />
          ))}
          {hiddenCount > 0 ? (
            <Text fontSize="xs" color="field.muted">
              +{hiddenCount}
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  )
}

function SourceRecordLine({ record }: { record: SourceSectionRecordSummary }) {
  const colorScheme =
    record.status === 'missing'
      ? 'red'
      : record.severity === 'error'
        ? 'red'
        : record.severity === 'warning'
          ? 'yellow'
          : record.severity === 'info'
            ? 'blue'
            : undefined

  return (
    <Stack spacing={0}>
      <HStack minW={0} gap={1}>
        <Badge flexShrink={0} colorScheme={colorScheme} variant="subtle">
          {record.kind}
        </Badge>
        {record.table ? (
          <Badge flexShrink={0} variant="outline">
            {record.table}
          </Badge>
        ) : null}
        <Text fontSize="xs" fontFamily="mono" noOfLines={1}>
          {record.label}
        </Text>
      </HStack>
      <Text fontSize="xs" color="field.muted" noOfLines={1}>
        {record.detail}
      </Text>
    </Stack>
  )
}

function formatSectionMeta(section: FeatureSourceSection) {
  const { meta } = section
  if (!meta) return []

  return [
    formatNumberMeta(meta.tableOffset, 'offset'),
    formatNumberMeta(meta.featureCount, 'features'),
    formatNumberMeta(meta.lookupCount, 'lookups'),
    formatNumberMeta(meta.extensionLookupCount, 'extensions'),
    meta.featureVariationsPresent === true ? 'FeatureVariations' : null,
  ].filter((item): item is string => Boolean(item))
}

function formatNumberMeta(value: unknown, label: string) {
  return typeof value === 'number' ? `${label}: ${value}` : null
}
