import { Badge, HStack, Text } from '@chakra-ui/react'
import type {
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface OpenTypeStatusBarProps {
  diagnostics: FeatureDiagnostic[]
  state: OpenTypeFeaturesState
}

export function OpenTypeStatusBar({
  diagnostics,
  state,
}: OpenTypeStatusBarProps) {
  const { t } = useTranslation()
  const errorCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length
  const warningCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning'
  ).length

  return (
    <HStack
      wrap="wrap"
      gap={2}
      borderBottomWidth="1px"
      pb={3}
      color="field.muted"
    >
      <StatusItem
        label={t('projectControl.features')}
        value={state.features.length}
      />
      <StatusItem
        label={t('projectControl.lookups')}
        value={state.lookups.length}
      />
      <StatusItem
        label={t('projectControl.unsupported')}
        value={state.unsupportedLookups.length}
      />
      <Badge colorScheme={errorCount ? 'red' : 'green'}>
        {errorCount} {t('projectControl.errors')}
      </Badge>
      <Badge colorScheme={warningCount ? 'yellow' : 'gray'}>
        {warningCount} {t('projectControl.warnings')}
      </Badge>
      <Badge variant="outline">{state.exportPolicy}</Badge>
    </HStack>
  )
}

function StatusItem({ label, value }: { label: string; value: number }) {
  return (
    <HStack gap={1}>
      <Text fontSize="xs">{label}</Text>
      <Badge>{value}</Badge>
    </HStack>
  )
}
