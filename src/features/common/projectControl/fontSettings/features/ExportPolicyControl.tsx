import {
  Alert,
  AlertDescription,
  FormControl,
  FormLabel,
  Select,
  Stack,
  Text,
} from '@chakra-ui/react'
import type {
  ExportPolicy,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'

interface ExportPolicyControlProps {
  state: OpenTypeFeaturesState
  onChange: (policy: ExportPolicy) => void
}

const POLICY_LABELS: Record<ExportPolicy, string> = {
  'rebuild-managed-layout-tables': 'Rebuild managed layout tables',
  'preserve-compiled-layout-tables': 'Preserve compiled layout tables',
  'drop-unsupported-and-rebuild': 'Drop unsupported and rebuild',
}

export function ExportPolicyControl({
  state,
  onChange,
}: ExportPolicyControlProps) {
  const warnings = getExportPolicyWarnings(state)

  return (
    <Stack spacing={3}>
      <FormControl>
        <FormLabel fontSize="sm">OpenType export policy</FormLabel>
        <Select
          value={state.exportPolicy}
          onChange={(event) => onChange(event.target.value as ExportPolicy)}
        >
          {Object.entries(POLICY_LABELS).map(([policy, label]) => (
            <option key={policy} value={policy}>
              {label}
            </option>
          ))}
        </Select>
      </FormControl>
      <Text fontSize="sm" color="field.muted">
        Export behavior is explicit because compiling generated FEA may replace
        existing compiled GSUB, GPOS, or GDEF tables.
      </Text>
      {warnings.map((warning) => (
        <Alert key={warning} status="warning" borderRadius="sm">
          <AlertDescription fontSize="sm">{warning}</AlertDescription>
        </Alert>
      ))}
    </Stack>
  )
}

function getExportPolicyWarnings(state: OpenTypeFeaturesState) {
  const warnings: string[] = []
  const hasEditableState = state.features.length > 0 || state.lookups.length > 0
  const hasUnsupportedLookups = state.unsupportedLookups.length > 0

  if (
    state.exportPolicy === 'rebuild-managed-layout-tables' &&
    hasUnsupportedLookups
  ) {
    warnings.push(
      'Some imported OpenType lookups are not editable or not representable. Rebuilding layout tables may remove them.'
    )
  }

  if (
    state.exportPolicy === 'preserve-compiled-layout-tables' &&
    hasEditableState
  ) {
    warnings.push(
      'Compiled OpenType layout tables will be preserved. Current feature edits will not be included in the exported font.'
    )
  }

  if (
    state.exportPolicy === 'drop-unsupported-and-rebuild' &&
    hasUnsupportedLookups
  ) {
    warnings.push(
      'Unsupported imported lookups are marked to be removed when layout tables are rebuilt.'
    )
  }

  return warnings
}
