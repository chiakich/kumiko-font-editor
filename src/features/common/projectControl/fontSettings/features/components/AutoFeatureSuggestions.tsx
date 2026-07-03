import { Badge, Button, HStack, Stack, Text } from '@chakra-ui/react'
import type { AutoFeatureSuggestion } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()

  return (
    <Stack gap={3}>
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {t('projectControl.autoFeatureSuggestions')}
        </Text>
        <Button size="sm" onClick={onScan}>
          {t('projectControl.scan')}
        </Button>
      </HStack>
      {suggestions.length === 0 ? (
        <Text fontSize="sm" color="mutedForeground">
          {t('projectControl.noPendingSuggestions')}
        </Text>
      ) : (
        suggestions.map((suggestion) => (
          <Stack
            key={suggestion.id}
            gap={2}
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
                <Badge colorPalette="blue">
                  {suggestion.ruleIds.length} {t('projectControl.rules')}
                </Badge>
              </HStack>
              <HStack>
                <Button size="xs" onClick={() => onIgnore(suggestion)}>
                  {t('projectControl.ignore')}
                </Button>
                <Button size="xs" onClick={() => onAccept(suggestion)}>
                  {t('projectControl.accept')}
                </Button>
              </HStack>
            </HStack>
            <Text fontSize="sm" color="mutedForeground">
              {suggestion.reason}
            </Text>
          </Stack>
        ))
      )}
    </Stack>
  )
}
