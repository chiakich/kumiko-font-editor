import { Badge, Stack, Text } from '@chakra-ui/react'
import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures'

interface FeatureDiagnosticsListProps {
  diagnostics: FeatureDiagnostic[]
}

export function FeatureDiagnosticsList({
  diagnostics,
}: FeatureDiagnosticsListProps) {
  if (diagnostics.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        No feature diagnostics.
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      {diagnostics.map((diagnostic) => (
        <Stack
          key={diagnostic.id}
          spacing={1}
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <Badge
            alignSelf="flex-start"
            colorScheme={diagnostic.severity === 'error' ? 'red' : 'yellow'}
          >
            {diagnostic.severity}
          </Badge>
          <Text fontSize="sm">{diagnostic.message}</Text>
        </Stack>
      ))}
    </Stack>
  )
}
