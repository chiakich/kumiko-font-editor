import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeatureListProps {
  state: OpenTypeFeaturesState
}

export function FeatureList({ state }: FeatureListProps) {
  const { t } = useTranslation()

  if (state.features.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noCanonicalOpentypeFeaturesYetScan')}
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
                <Badge colorScheme="gray">{t('projectControl.inactive')}</Badge>
              ) : null}
            </HStack>
            <Text fontSize="xs" color="field.muted">
              {feature.entries.length}{' '}
              {t('projectControl.scriptLanguageEntries')}
            </Text>
          </Stack>
          <Text fontSize="sm" color="field.muted">
            {feature.entries.reduce(
              (total, entry) => total + entry.lookupIds.length,
              0
            )}{' '}
            {t('projectControl.lookups')}
          </Text>
        </HStack>
      ))}
    </Stack>
  )
}
