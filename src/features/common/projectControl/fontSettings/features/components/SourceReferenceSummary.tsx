import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { SourceSectionRecordGroup } from 'src/lib/openTypeFeatures'
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
    <Stack spacing={1}>
      <Text fontSize="xs" color="field.muted">
        {t('projectControl.sourceSections')}
      </Text>
      <HStack wrap="wrap">
        {sourceSectionRecords.map(({ records, section }) => (
          <Badge
            key={section.id}
            title={records
              .map((record) => `${record.kind}: ${record.label}`)
              .join(', ')}
            variant="outline"
          >
            {section.table ? `${section.table} ` : ''}
            {section.status}
          </Badge>
        ))}
      </HStack>
    </Stack>
  )
}
