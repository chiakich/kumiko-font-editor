import { Badge, Stack, Text } from '@chakra-ui/react'
import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeatureDiagnosticsListProps {
  diagnostics: FeatureDiagnostic[]
}

export function FeatureDiagnosticsList({
  diagnostics,
}: FeatureDiagnosticsListProps) {
  const { t } = useTranslation()

  if (diagnostics.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noFeatureDiagnostics')}
      </Text>
    )
  }

  return (
    <Stack gap={2}>
      {diagnostics.map((diagnostic) => (
        <Stack
          key={diagnostic.id}
          gap={1}
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <Badge
            alignSelf="flex-start"
            colorPalette={diagnostic.severity === 'error' ? 'red' : 'yellow'}
          >
            {diagnostic.severity}
          </Badge>
          <Text fontSize="sm">{diagnostic.message}</Text>
        </Stack>
      ))}
    </Stack>
  )
}
