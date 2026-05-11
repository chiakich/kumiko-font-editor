import { Divider, Stack, Text } from '@chakra-ui/react'
import { AutoFeatureSuggestions } from 'src/features/common/projectControl/fontSettings/features/AutoFeatureSuggestions'
import { ExportPolicyControl } from 'src/features/common/projectControl/fontSettings/features/ExportPolicyControl'
import { FeatureDiagnosticsList } from 'src/features/common/projectControl/fontSettings/features/FeatureDiagnosticsList'
import { GeneratedFeaPreview } from 'src/features/common/projectControl/fontSettings/features/GeneratedFeaPreview'
import { UnsupportedLookupList } from 'src/features/common/projectControl/fontSettings/features/UnsupportedLookupList'
import type {
  AutoFeatureSuggestion,
  ExportPolicy,
  FeatureDiagnostic,
  GeneratedFeaSourceMap,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'

interface FeatureWorkflowPanelProps {
  diagnostics: FeatureDiagnostic[]
  generatedFea: {
    sourceMap: GeneratedFeaSourceMap
    text: string
  }
  state: OpenTypeFeaturesState
  suggestions: AutoFeatureSuggestion[]
  onAcceptSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onExportPolicyChange: (exportPolicy: ExportPolicy) => void
  onIgnoreSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onScanSuggestions: () => void
}

export function FeatureWorkflowPanel({
  diagnostics,
  generatedFea,
  state,
  suggestions,
  onAcceptSuggestion,
  onExportPolicyChange,
  onIgnoreSuggestion,
  onScanSuggestions,
}: FeatureWorkflowPanelProps) {
  return (
    <Stack spacing={5}>
      <Stack spacing={2}>
        <Text fontWeight="semibold">Workflow</Text>
        <Text fontSize="sm" color="field.muted">
          Scan feature suggestions, choose export behavior, and inspect
          generated build output from the canonical Kumiko feature model.
        </Text>
      </Stack>

      <ExportPolicyControl state={state} onChange={onExportPolicyChange} />
      <Divider />
      <AutoFeatureSuggestions
        suggestions={suggestions}
        onAccept={onAcceptSuggestion}
        onIgnore={onIgnoreSuggestion}
        onScan={onScanSuggestions}
      />
      <Divider />
      <UnsupportedLookupList unsupportedLookups={state.unsupportedLookups} />
      <Divider />
      <FeatureDiagnosticsList diagnostics={diagnostics} />
      <Divider />
      <GeneratedFeaPreview
        feaText={generatedFea.text}
        sourceMap={generatedFea.sourceMap}
      />
    </Stack>
  )
}
