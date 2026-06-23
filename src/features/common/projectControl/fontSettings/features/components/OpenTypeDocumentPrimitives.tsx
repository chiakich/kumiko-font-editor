import { HStack, Stack, Text } from '@chakra-ui/react'
import { SourceReferenceSummary } from 'src/features/common/projectControl/fontSettings/features/components/SourceReferenceSummary'
import type { SourceSectionRecordGroup } from 'src/lib/openTypeFeatures'

export function WorkspaceHeader({
  badges,
  description,
  title,
}: {
  badges: string[]
  description: string
  title: string
}) {
  return (
    <HStack justify="space-between" align="flex-start" gap={3}>
      <Stack spacing={1} minW={0}>
        <Text fontSize="lg" fontWeight="900">
          {title}
        </Text>
        <Text fontSize="sm" color="field.muted">
          {description}
        </Text>
      </Stack>
      <HStack wrap="wrap" justify="flex-end" gap={1}>
        {badges.map((badge) => (
          <Text
            key={badge}
            as="span"
            borderWidth="1px"
            borderRadius="sm"
            px={2}
            py={0.5}
            fontSize="xs"
            color="field.muted"
          >
            {badge}
          </Text>
        ))}
      </HStack>
    </HStack>
  )
}

export function SourceSectionsDocument({
  emptyText,
  sourceSectionRecords,
}: {
  emptyText: string
  sourceSectionRecords: SourceSectionRecordGroup[]
}) {
  if (sourceSectionRecords.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {emptyText}
      </Text>
    )
  }

  return <SourceReferenceSummary sourceSectionRecords={sourceSectionRecords} />
}

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Stack borderWidth="1px" borderRadius="sm" p={3} spacing={1}>
      <Text fontSize="xs" color="field.muted">
        {label}
      </Text>
      <Text fontSize="2xl" fontWeight="900">
        {value}
      </Text>
    </Stack>
  )
}
