import {
  Divider,
  FormControl,
  FormLabel,
  Stack,
  Textarea,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import { AutoFeatureSuggestions } from 'src/features/common/projectControl/fontSettings/features/AutoFeatureSuggestions'
import { ExportPolicyControl } from 'src/features/common/projectControl/fontSettings/features/ExportPolicyControl'
import { FeatureDiagnosticsList } from 'src/features/common/projectControl/fontSettings/features/FeatureDiagnosticsList'
import { FeatureList } from 'src/features/common/projectControl/fontSettings/features/FeatureList'
import { FeatureSummary } from 'src/features/common/projectControl/fontSettings/features/FeatureSummary'
import { GeneratedFeaPreview } from 'src/features/common/projectControl/fontSettings/features/GeneratedFeaPreview'
import { LookupInspector } from 'src/features/common/projectControl/fontSettings/features/LookupInspector'
import { updateLookupRule } from 'src/features/common/projectControl/fontSettings/features/ruleEditorState'
import { UnsupportedLookupList } from 'src/features/common/projectControl/fontSettings/features/UnsupportedLookupList'
import {
  applyAutoFeatureSuggestion,
  buildAutoFeatureSuggestions,
  generateFea,
  ignoreAutoFeatureSuggestion,
  validateFeatures,
  type AutoFeatureSuggestion,
  type ExportPolicy,
  type OpenTypeFeaturesState,
  type Rule,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'

interface FontFeaturesTabProps {
  fontData: FontData | null
  featuresText: string
  openTypeFeatures: OpenTypeFeaturesState
  onFeaturesTextChange: (value: string) => void
  onOpenTypeFeaturesChange: (value: OpenTypeFeaturesState) => void
}

export function FontFeaturesTab({
  fontData,
  featuresText,
  openTypeFeatures,
  onFeaturesTextChange,
  onOpenTypeFeaturesChange,
}: FontFeaturesTabProps) {
  const diagnostics = useMemo(
    () => (fontData ? validateFeatures(openTypeFeatures, fontData) : []),
    [fontData, openTypeFeatures]
  )
  const generatedFea = useMemo(
    () => generateFea(openTypeFeatures),
    [openTypeFeatures]
  )
  const suggestions = useMemo(
    () =>
      fontData ? buildAutoFeatureSuggestions(fontData, openTypeFeatures) : [],
    [fontData, openTypeFeatures]
  )

  const acceptSuggestion = (suggestion: AutoFeatureSuggestion) => {
    onOpenTypeFeaturesChange(
      applyAutoFeatureSuggestion(openTypeFeatures, suggestion)
    )
  }

  const ignoreSuggestion = (suggestion: AutoFeatureSuggestion) => {
    onOpenTypeFeaturesChange(
      ignoreAutoFeatureSuggestion(openTypeFeatures, suggestion)
    )
  }

  const updateExportPolicy = (exportPolicy: ExportPolicy) => {
    onOpenTypeFeaturesChange({ ...openTypeFeatures, exportPolicy })
  }

  const updateRule = (lookupId: string, rule: Rule) => {
    onOpenTypeFeaturesChange(updateLookupRule(openTypeFeatures, lookupId, rule))
  }

  return (
    <Stack spacing={5}>
      <FeatureSummary state={openTypeFeatures} diagnostics={diagnostics} />
      <ExportPolicyControl
        state={openTypeFeatures}
        onChange={updateExportPolicy}
      />
      <Divider />
      <AutoFeatureSuggestions
        suggestions={suggestions}
        onAccept={acceptSuggestion}
        onIgnore={ignoreSuggestion}
        onScan={() => onOpenTypeFeaturesChange({ ...openTypeFeatures })}
      />
      <Divider />
      <FeatureList state={openTypeFeatures} />
      <Divider />
      <LookupInspector
        state={openTypeFeatures}
        diagnostics={diagnostics}
        onRuleChange={updateRule}
      />
      <Divider />
      <UnsupportedLookupList
        unsupportedLookups={openTypeFeatures.unsupportedLookups}
      />
      <Divider />
      <FeatureDiagnosticsList diagnostics={diagnostics} />
      <Divider />
      <GeneratedFeaPreview
        feaText={generatedFea.text}
        sourceMap={generatedFea.sourceMap}
      />
      <Divider />
      <FormControl>
        <FormLabel fontSize="sm">Imported or legacy feature text</FormLabel>
        <Textarea
          minH="220px"
          fontFamily="mono"
          value={featuresText}
          onChange={(event) => onFeaturesTextChange(event.target.value)}
          placeholder={`languagesystem DFLT dflt;\n\nfeature liga {\n  sub f i by fi;\n} liga;`}
        />
      </FormControl>
    </Stack>
  )
}
