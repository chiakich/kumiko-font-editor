import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { UnsupportedLookup } from 'src/lib/openTypeFeatures'

interface UnsupportedLookupListProps {
  unsupportedLookups: UnsupportedLookup[]
}

export function UnsupportedLookupList({
  unsupportedLookups,
}: UnsupportedLookupListProps) {
  if (unsupportedLookups.length === 0) {
    return (
      <Stack spacing={2}>
        <Text fontWeight="semibold">Unsupported Imported Lookups</Text>
        <Text fontSize="sm" color="field.muted">
          No unsupported imported lookups are recorded.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Text fontWeight="semibold">Unsupported Imported Lookups</Text>
      {unsupportedLookups.map((lookup) => (
        <Stack
          key={lookup.id}
          spacing={2}
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <HStack justify="space-between" align="flex-start">
            <HStack wrap="wrap">
              <Badge>{lookup.table}</Badge>
              <Badge>type {lookup.lookupType}</Badge>
              <Badge colorScheme="orange">{lookup.preserveMode}</Badge>
            </HStack>
            <Text fontSize="xs" color="field.muted">
              lookup {lookup.lookupIndex}
            </Text>
          </HStack>
          <Text fontSize="sm">{lookup.reason}</Text>
          <Text fontSize="xs" color="field.muted">
            {lookup.rawSummary}
          </Text>
          <Text fontSize="xs" color="field.muted">
            Subtable formats: {lookup.subtableFormats.join(', ') || 'unknown'}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}
