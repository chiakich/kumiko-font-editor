import { Box, Grid, GridItem, Stack } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { FeatureClassesPanel } from 'src/features/common/projectControl/fontSettings/features/FeatureClassesPanel'
import { FeatureDetailPanel } from 'src/features/common/projectControl/fontSettings/features/FeatureDetailPanel'
import { FeaturePreludePanel } from 'src/features/common/projectControl/fontSettings/features/FeaturePreludePanel'
import { FeatureSummary } from 'src/features/common/projectControl/fontSettings/features/FeatureSummary'
import {
  FeatureWorkbenchSidebar,
  type FeatureWorkbenchSelection,
} from 'src/features/common/projectControl/fontSettings/features/FeatureWorkbenchSidebar'
import { FeatureWorkflowPanel } from 'src/features/common/projectControl/fontSettings/features/FeatureWorkflowPanel'
import { updateLookupRule } from 'src/features/common/projectControl/fontSettings/features/ruleEditorState'
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
  const [selected, setSelected] = useState<FeatureWorkbenchSelection>({
    kind: 'prelude',
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

  const selectedFeature =
    selected.kind === 'feature'
      ? (openTypeFeatures.features.find(
          (feature) => feature.id === selected.featureId
        ) ?? null)
      : null
  const activeSelection =
    selected.kind === 'feature' && !selectedFeature
      ? ({ kind: 'prelude' } as const)
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
              <FeaturePreludePanel
                featuresText={featuresText}
                state={openTypeFeatures}
                onFeaturesTextChange={onFeaturesTextChange}
              />
            )}
          </Box>
        </GridItem>
      </Grid>
    </Stack>
  )
}
