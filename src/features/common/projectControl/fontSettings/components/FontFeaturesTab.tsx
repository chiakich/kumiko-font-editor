import { Box, Grid, GridItem, Stack } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { OpenTypeDocumentWorkspace } from '@/features/common/projectControl/fontSettings/features/components/OpenTypeDocumentWorkspace'
import { OpenTypeOutline } from '@/features/common/projectControl/fontSettings/features/components/OpenTypeOutline'
import { OpenTypeStatusBar } from '@/features/common/projectControl/fontSettings/features/components/OpenTypeStatusBar'
import { ShapingPreviewBar } from '@/features/common/projectControl/fontSettings/features/components/ShapingPreviewBar'
import { useShapingPreview } from '@/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'
import {
  DEFAULT_OPEN_TYPE_SELECTION,
  type OpenTypeWorkbenchSelection,
} from '@/features/common/projectControl/fontSettings/features/components/openTypeWorkbenchSelection'
import {
  applyAutoFeatureSuggestion,
  buildAutoFeatureSuggestions,
  classifyRawFeatureTextSource,
  generateFea,
  getRawFeatureText,
  ignoreAutoFeatureSuggestion,
  mergeFeatureDiagnostics,
  setRawFeatureTextSource,
  validateFeatures,
  type AutoFeatureSuggestion,
  type ExportPolicy,
  type OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'
import type { FontData } from '@/domain'

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
  const [selected, setSelected] = useState<OpenTypeWorkbenchSelection>(
    DEFAULT_OPEN_TYPE_SELECTION
  )
  const diagnostics = useMemo(
    () =>
      fontData
        ? mergeFeatureDiagnostics(
            openTypeFeatures.diagnostics,
            validateFeatures(openTypeFeatures, fontData)
          )
        : (openTypeFeatures.diagnostics ?? []),
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

  const updateRawFeatureText = (rawFeatureText: string) => {
    onOpenTypeFeaturesChange(
      classifyRawFeatureTextSource(
        setRawFeatureTextSource(openTypeFeatures, rawFeatureText, {
          origin: 'manual-input',
        }),
        { origin: 'manual-input' }
      )
    )
  }

  const activeSelection = normalizeSelection(selected, openTypeFeatures)
  const shapingPreview = useShapingPreview({ fontData, openTypeFeatures })
  // Compiler failures land as line marks on the generated FEA view.
  const compileErrorLocations =
    shapingPreview.fontStatus.state === 'error'
      ? shapingPreview.fontStatus.errorLocations
      : []

  return (
    <Stack gap={5} h="100%" minH={0}>
      <OpenTypeStatusBar state={openTypeFeatures} diagnostics={diagnostics} />
      <Grid
        gap={5}
        flex={1}
        minH={0}
        overflow="hidden"
        templateColumns={{ base: '1fr', lg: '280px minmax(0, 1fr)' }}
      >
        <GridItem minH={0} overflow="auto" pr={{ base: 0, lg: 1 }}>
          <OpenTypeOutline
            diagnostics={diagnostics}
            selected={activeSelection}
            state={openTypeFeatures}
            suggestionsCount={suggestions.length}
            onSelect={setSelected}
          />
        </GridItem>
        <GridItem minH={0} minW={0} overflow="auto" pr={1}>
          <Box pb={1}>
            <OpenTypeDocumentWorkspace
              compileErrorLocations={compileErrorLocations}
              diagnostics={diagnostics}
              fontData={fontData}
              onStateChange={onOpenTypeFeaturesChange}
              generatedFea={generatedFea}
              rawFeatureText={getRawFeatureText(openTypeFeatures) ?? ''}
              selection={activeSelection}
              state={openTypeFeatures}
              suggestions={suggestions}
              onAcceptSuggestion={acceptSuggestion}
              onExportPolicyChange={updateExportPolicy}
              onIgnoreSuggestion={ignoreSuggestion}
              onRawFeatureTextChange={updateRawFeatureText}
              onScanSuggestions={() =>
                onOpenTypeFeaturesChange({ ...openTypeFeatures })
              }
            />
          </Box>
        </GridItem>
      </Grid>
      <ShapingPreviewBar preview={shapingPreview} />
    </Stack>
  )
}

function normalizeSelection(
  selection: OpenTypeWorkbenchSelection,
  state: OpenTypeFeaturesState
): OpenTypeWorkbenchSelection {
  if (
    selection.kind === 'feature' &&
    !state.features.some((feature) => feature.id === selection.featureId)
  ) {
    return DEFAULT_OPEN_TYPE_SELECTION
  }

  return selection
}
