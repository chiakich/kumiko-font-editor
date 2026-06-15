import { Divider, Stack, Text } from '@chakra-ui/react'
import { AutoFeatureSuggestions } from 'src/features/common/projectControl/fontSettings/features/components/AutoFeatureSuggestions'
import { ExportPolicyControl } from 'src/features/common/projectControl/fontSettings/features/components/ExportPolicyControl'
import { FeatureDiagnosticsList } from 'src/features/common/projectControl/fontSettings/features/components/FeatureDiagnosticsList'
import { GeneratedFeaPreview } from 'src/features/common/projectControl/fontSettings/features/components/GeneratedFeaPreview'
import { ImportExportOverview } from 'src/features/common/projectControl/fontSettings/features/components/ImportExportOverview'
import { UnsupportedLookupList } from 'src/features/common/projectControl/fontSettings/features/components/UnsupportedLookupList'
import type {
  AutoFeatureSuggestion,
  ExportPolicy,
  FeatureDiagnostic,
  GeneratedFeaSourceMap,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()

  return (
    <Stack spacing={5}>
      <Stack spacing={2}>
        <Text fontWeight="semibold">{t('projectControl.workflow')}</Text>
        <Text fontSize="sm" color="field.muted">
          {t('projectControl.scanFeatureSuggestionsChooseExportBehavior')}
        </Text>
      </Stack>

      <ImportExportOverview state={state} />
      <Divider />
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
