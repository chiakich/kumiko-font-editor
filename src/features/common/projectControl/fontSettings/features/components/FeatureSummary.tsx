import { Badge, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react'
import type {
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeatureSummaryProps {
  state: OpenTypeFeaturesState
  diagnostics: FeatureDiagnostic[]
}

export function FeatureSummary({ state, diagnostics }: FeatureSummaryProps) {
  const { t } = useTranslation()

  const errorCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length
  const warningCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning'
  ).length

  return (
    <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
      <SummaryTile
        label={t('projectControl.features')}
        value={state.features.length}
      />
      <SummaryTile
        label={t('projectControl.lookups')}
        value={state.lookups.length}
      />
      <SummaryTile
        label={t('projectControl.unsupported')}
        value={state.unsupportedLookups.length}
      />
      <Stack borderWidth="1px" borderRadius="sm" p={3} spacing={2}>
        <Text fontSize="xs" color="field.muted">
          {t('projectControl.diagnostics')}
        </Text>
        <HStack>
          <Badge colorScheme={errorCount ? 'red' : 'green'}>
            {errorCount} {t('projectControl.errors')}
          </Badge>
          <Badge colorScheme={warningCount ? 'yellow' : 'gray'}>
            {warningCount} {t('projectControl.warnings')}
          </Badge>
        </HStack>
      </Stack>
    </SimpleGrid>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
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
