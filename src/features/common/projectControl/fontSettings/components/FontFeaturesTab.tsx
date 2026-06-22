import { Box, Grid, GridItem, Stack } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { FeatureClassesPanel } from 'src/features/common/projectControl/fontSettings/features/components/FeatureClassesPanel'
import { FeatureDetailPanel } from 'src/features/common/projectControl/fontSettings/features/components/FeatureDetailPanel'
import { FeatureSourcePanel } from 'src/features/common/projectControl/fontSettings/features/components/FeatureSourcePanel'
import { FeatureSummary } from 'src/features/common/projectControl/fontSettings/features/components/FeatureSummary'
import {
  FeatureWorkbenchSidebar,
  type FeatureWorkbenchSelection,
} from 'src/features/common/projectControl/fontSettings/features/components/FeatureWorkbenchSidebar'
import { FeatureWorkflowPanel } from 'src/features/common/projectControl/fontSettings/features/components/FeatureWorkflowPanel'
import { updateLookupRule } from 'src/features/common/projectControl/fontSettings/features/utils/ruleEditorState'
import {
  applyAutoFeatureSuggestion,
  buildAutoFeatureSuggestions,
  generateFea,
  ignoreAutoFeatureSuggestion,
  setRawFeatureTextSource,
  validateFeatures,
  type AutoFeatureSuggestion,
  type ExportPolicy,
  type OpenTypeFeaturesState,
  type Rule,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'

interface FontFeaturesTabProps {
  fontData: FontData | null
  openTypeFeatures: OpenTypeFeaturesState
  onOpenTypeFeaturesChange: (value: OpenTypeFeaturesState) => void
}

export function FontFeaturesTab({
  fontData,
  openTypeFeatures,
  onOpenTypeFeaturesChange,
}: FontFeaturesTabProps) {
  const [selected, setSelected] = useState<FeatureWorkbenchSelection>({
    kind: 'source',
  })
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

  const updateRawFeatureText = (rawFeatureText: string) => {
    onOpenTypeFeaturesChange(
      setRawFeatureTextSource(openTypeFeatures, rawFeatureText, {
        origin: 'manual-input',
      })
    )
  }

  const selectedFeature =
    selected.kind === 'feature'
      ? (openTypeFeatures.features.find(
          (feature) => feature.id === selected.featureId
        ) ?? null)
      : null
  const activeSelection =
    selected.kind === 'feature' && !selectedFeature
      ? ({ kind: 'source' } as const)
      : selected

  return (
    <Stack spacing={5} h="100%" minH={0}>
      <FeatureSummary state={openTypeFeatures} diagnostics={diagnostics} />
      <Grid
        gap={5}
        flex={1}
        minH={0}
        overflow="hidden"
        templateColumns={{ base: '1fr', lg: '280px minmax(0, 1fr)' }}
      >
        <GridItem minH={0} overflow="auto" pr={{ base: 0, lg: 1 }}>
          <FeatureWorkbenchSidebar
            diagnostics={diagnostics}
            selected={activeSelection}
            state={openTypeFeatures}
            suggestionsCount={suggestions.length}
            onSelect={setSelected}
          />
        </GridItem>
        <GridItem minH={0} minW={0} overflow="auto" pr={1}>
          <Box pb={1}>
            {activeSelection.kind === 'classes' ? (
              <FeatureClassesPanel state={openTypeFeatures} />
            ) : activeSelection.kind === 'workflow' ? (
              <FeatureWorkflowPanel
                diagnostics={diagnostics}
                generatedFea={generatedFea}
                state={openTypeFeatures}
                suggestions={suggestions}
                onAcceptSuggestion={acceptSuggestion}
                onExportPolicyChange={updateExportPolicy}
                onIgnoreSuggestion={ignoreSuggestion}
                onScanSuggestions={() =>
                  onOpenTypeFeaturesChange({ ...openTypeFeatures })
                }
              />
            ) : selectedFeature ? (
              <FeatureDetailPanel
                diagnostics={diagnostics}
                feature={selectedFeature}
                state={openTypeFeatures}
                onRuleChange={updateRule}
              />
            ) : (
              <FeatureSourcePanel
                rawFeatureText={openTypeFeatures.rawFeatureText ?? ''}
                state={openTypeFeatures}
                onRawFeatureTextChange={updateRawFeatureText}
              />
            )}
          </Box>
        </GridItem>
      </Grid>
    </Stack>
  )
}
