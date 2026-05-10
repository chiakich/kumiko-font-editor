import { Badge, Button, HStack, Stack, Text } from '@chakra-ui/react'
import type { AutoFeatureSuggestion } from 'src/lib/openTypeFeatures'

interface AutoFeatureSuggestionsProps {
  suggestions: AutoFeatureSuggestion[]
  onAccept: (suggestion: AutoFeatureSuggestion) => void
  onIgnore: (suggestion: AutoFeatureSuggestion) => void
  onScan: () => void
}

export function AutoFeatureSuggestions({
  suggestions,
  onAccept,
  onIgnore,
  onScan,
}: AutoFeatureSuggestionsProps) {
  return (
    <Stack spacing={3}>
      <HStack justify="space-between">
        <Text fontWeight="semibold">Auto Feature Suggestions</Text>
        <Button size="sm" onClick={onScan}>
          Scan
        </Button>
      </HStack>
      {suggestions.length === 0 ? (
        <Text fontSize="sm" color="field.muted">
          No pending suggestions.
        </Text>
      ) : (
        suggestions.map((suggestion) => (
          <Stack
            key={suggestion.id}
            spacing={2}
            borderWidth="1px"
            borderRadius="sm"
            p={3}
          >
            <HStack justify="space-between">
              <HStack>
                <Text fontFamily="mono" fontWeight="900">
                  {suggestion.featureTag}
                </Text>
                <Badge>{suggestion.confidence}</Badge>
                <Badge colorScheme="blue">
                  {suggestion.ruleIds.length} rules
                </Badge>
              </HStack>
              <HStack>
                <Button size="xs" onClick={() => onIgnore(suggestion)}>
                  Ignore
                </Button>
                <Button size="xs" onClick={() => onAccept(suggestion)}>
                  Accept
                </Button>
              </HStack>
            </HStack>
            <Text fontSize="sm" color="field.muted">
              {suggestion.reason}
            </Text>
          </Stack>
        ))
      )}
    </Stack>
  )
}
