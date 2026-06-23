import { Divider, Stack, Text } from '@chakra-ui/react'
import { AutoFeatureSuggestions } from 'src/features/common/projectControl/fontSettings/features/components/AutoFeatureSuggestions'
import { ExportPolicyControl } from 'src/features/common/projectControl/fontSettings/features/components/ExportPolicyControl'
import { FeatureDiagnosticsList } from 'src/features/common/projectControl/fontSettings/features/components/FeatureDiagnosticsList'
import { GeneratedFeaPreview } from 'src/features/common/projectControl/fontSettings/features/components/GeneratedFeaPreview'
import { ImportExportOverview } from 'src/features/common/projectControl/fontSettings/features/components/ImportExportOverview'
import { WorkspaceHeader } from 'src/features/common/projectControl/fontSettings/features/components/OpenTypeDocumentPrimitives'
import {
  FeatureDocument,
  TableDocument,
} from 'src/features/common/projectControl/fontSettings/features/components/OpenTypeRecordDocuments'
import {
  GdefDocument,
  GlyphClassDocument,
  ImportedTablesDocument,
  LanguageSystemDocument,
  MarkClassDocument,
  RawFeatureTextEditor,
} from 'src/features/common/projectControl/fontSettings/features/components/OpenTypeSourceDocuments'
import type { OpenTypeWorkbenchSelection } from 'src/features/common/projectControl/fontSettings/features/components/openTypeWorkbenchSelection'
import { UnsupportedLookupList } from 'src/features/common/projectControl/fontSettings/features/components/UnsupportedLookupList'
import type {
  AutoFeatureSuggestion,
  ExportPolicy,
  FeatureDiagnostic,
  FeatureRecord,
  GeneratedFeaSourceMap,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface OpenTypeDocumentWorkspaceProps {
  diagnostics: FeatureDiagnostic[]
  generatedFea: {
    sourceMap: GeneratedFeaSourceMap
    text: string
  }
  rawFeatureText: string
  selection: OpenTypeWorkbenchSelection
  state: OpenTypeFeaturesState
  suggestions: AutoFeatureSuggestion[]
  onAcceptSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onExportPolicyChange: (exportPolicy: ExportPolicy) => void
  onIgnoreSuggestion: (suggestion: AutoFeatureSuggestion) => void
  onRawFeatureTextChange: (value: string) => void
  onScanSuggestions: () => void
}

export function OpenTypeDocumentWorkspace({
  diagnostics,
  generatedFea,
  rawFeatureText,
  selection,
  state,
  suggestions,
  onAcceptSuggestion,
  onExportPolicyChange,
  onIgnoreSuggestion,
  onRawFeatureTextChange,
  onScanSuggestions,
}: OpenTypeDocumentWorkspaceProps) {
  const { t } = useTranslation()
  const selectedFeature = getSelectedFeature(selection, state)

  return (
    <Stack spacing={4}>
      <WorkspaceHeader
        badges={getSelectionBadges(selection, selectedFeature)}
        title={getSelectionTitle(selection, selectedFeature, t)}
      />
      <SelectionView
        diagnostics={diagnostics}
        generatedFea={generatedFea}
        rawFeatureText={rawFeatureText}
        selectedFeature={selectedFeature}
        selection={selection}
        state={state}
        suggestions={suggestions}
        onAcceptSuggestion={onAcceptSuggestion}
        onExportPolicyChange={onExportPolicyChange}
        onIgnoreSuggestion={onIgnoreSuggestion}
        onRawFeatureTextChange={onRawFeatureTextChange}
        onScanSuggestions={onScanSuggestions}
      />
    </Stack>
  )
}

function SelectionView({
  diagnostics,
  generatedFea,
  rawFeatureText,
  selectedFeature,
  selection,
  state,
  suggestions,
  onAcceptSuggestion,
  onExportPolicyChange,
  onIgnoreSuggestion,
  onRawFeatureTextChange,
  onScanSuggestions,
}: OpenTypeDocumentWorkspaceProps & {
  selectedFeature: FeatureRecord | null
}) {
  const { t } = useTranslation()

  if (selection.kind === 'source') {
    return selection.view === 'raw-fea' ? (
      <RawFeatureTextEditor
        rawFeatureText={rawFeatureText}
        onRawFeatureTextChange={onRawFeatureTextChange}
      />
    ) : (
      <ImportedTablesDocument state={state} />
    )
  }

  if (selection.kind === 'prefix') {
    return (
      {
        languagesystems: <LanguageSystemDocument state={state} />,
        'glyph-classes': (
          <GlyphClassDocument glyphClasses={state.glyphClasses} />
        ),
        'mark-classes': <MarkClassDocument markClasses={state.markClasses} />,
        gdef: <GdefDocument state={state} />,
      }[selection.view] ?? null
    )
  }

  if (selection.kind === 'feature') {
    return selectedFeature ? (
      <FeatureDocument
        feature={selectedFeature}
        generatedFea={generatedFea}
        state={state}
      />
    ) : (
      <Text fontSize="sm" color="field.muted">
        {t('projectControl.noFeaturesYet')}
      </Text>
    )
  }

  if (selection.kind === 'table') {
    return <TableDocument state={state} table={selection.table} />
  }

  return (
    {
      'generated-fea': (
        <GeneratedFeaPreview
          feaText={generatedFea.text}
          sourceMap={generatedFea.sourceMap}
        />
      ),
      'export-policy': (
        <Stack spacing={5}>
          <ImportExportOverview state={state} />
          <Divider />
          <ExportPolicyControl
            diagnostics={diagnostics}
            state={state}
            onChange={onExportPolicyChange}
          />
          <Divider />
          <UnsupportedLookupList
            unsupportedLookups={state.unsupportedLookups}
          />
        </Stack>
      ),
      diagnostics: <FeatureDiagnosticsList diagnostics={diagnostics} />,
      suggestions: (
        <AutoFeatureSuggestions
          suggestions={suggestions}
          onAccept={onAcceptSuggestion}
          onIgnore={onIgnoreSuggestion}
          onScan={onScanSuggestions}
        />
      ),
    }[selection.view] ?? null
  )
}

function getSelectedFeature(
  selection: OpenTypeWorkbenchSelection,
  state: OpenTypeFeaturesState
) {
  return selection.kind === 'feature'
    ? (state.features.find((feature) => feature.id === selection.featureId) ??
        null)
    : null
}

function getSelectionTitle(
  selection: OpenTypeWorkbenchSelection,
  selectedFeature: FeatureRecord | null,
  t: (key: string) => string
) {
  if (selection.kind === 'source') {
    return selection.view === 'raw-fea'
      ? t('projectControl.featuresFea')
      : t('projectControl.importedTables')
  }

  if (selection.kind === 'prefix') {
    return {
      languagesystems: t('projectControl.languageSystems'),
      'glyph-classes': t('projectControl.glyphClasses'),
      'mark-classes': t('projectControl.markClasses'),
      gdef: t('projectControl.gdef'),
    }[selection.view]
  }

  if (selection.kind === 'feature') {
    return selectedFeature?.tag ?? t('projectControl.features')
  }

  if (selection.kind === 'table') {
    return selection.table
  }

  return {
    'generated-fea': t('projectControl.generatedFea'),
    'export-policy': t('projectControl.exportPolicy'),
    diagnostics: t('projectControl.diagnostics'),
    suggestions: t('projectControl.suggestions'),
  }[selection.view]
}

function getSelectionBadges(
  selection: OpenTypeWorkbenchSelection,
  selectedFeature: FeatureRecord | null
) {
  if (selection.kind === 'feature' && selectedFeature) {
    return [
      selectedFeature.origin,
      ...(selectedFeature.isActive ? [] : ['inactive']),
    ]
  }

  if (selection.kind === 'table') {
    return ['OpenType']
  }

  return []
}
