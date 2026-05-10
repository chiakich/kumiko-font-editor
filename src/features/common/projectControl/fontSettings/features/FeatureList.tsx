import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

interface FeatureListProps {
  state: OpenTypeFeaturesState
}

export function FeatureList({ state }: FeatureListProps) {
  if (state.features.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        No canonical OpenType features yet. Scan suggestions to create rules
        from glyph names.
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      {state.features.map((feature) => (
        <HStack
          key={feature.id}
          justify="space-between"
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <Stack spacing={1}>
            <HStack>
              <Text fontFamily="mono" fontWeight="900">
                {feature.tag}
              </Text>
              <Badge>{feature.origin}</Badge>
              {!feature.isActive ? (
                <Badge colorScheme="gray">inactive</Badge>
              ) : null}
            </HStack>
            <Text fontSize="xs" color="field.muted">
              {feature.entries.length} script/language entries
            </Text>
          </Stack>
          <Text fontSize="sm" color="field.muted">
            {feature.entries.reduce(
              (total, entry) => total + entry.lookupIds.length,
              0
            )}{' '}
            lookups
          </Text>
        </HStack>
      ))}
    </Stack>
  )
}
