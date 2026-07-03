import { Badge, Button, HStack, Stack, Text } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import type {
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import {
  diagnosticsForFeature,
  diagnosticsForWorkflow,
  getFeatureDetail,
  getFeatureTable,
  getLayoutTableSummaries,
  isBuildSelected,
  isPrefixSelected,
  isSourceSelected,
} from 'src/features/common/projectControl/fontSettings/features/components/openTypeOutlineModel'
import type { OpenTypeWorkbenchSelection } from 'src/features/common/projectControl/fontSettings/features/components/openTypeWorkbenchSelection'
import { useTranslation } from 'react-i18next'

interface OpenTypeOutlineProps {
  diagnostics: FeatureDiagnostic[]
  selected: OpenTypeWorkbenchSelection
  state: OpenTypeFeaturesState
  suggestionsCount: number
  onSelect: (selection: OpenTypeWorkbenchSelection) => void
}

export function OpenTypeOutline({
  diagnostics,
  selected,
  state,
  suggestionsCount,
  onSelect,
}: OpenTypeOutlineProps) {
  const { t } = useTranslation()
  const tableSummaries = getLayoutTableSummaries(state)
  const sourceSections = state.sourceSections ?? []

  return (
    <Stack
      gap={4}
      borderRightWidth={{ base: 0, lg: '1px' }}
      pr={{ base: 0, lg: 4 }}
      minW={0}
    >
      <OutlineSection title={t('projectControl.sourceOutline')}>
        <OutlineButton
          isSelected={isSourceSelected(selected, 'raw-fea')}
          label={t('projectControl.featuresFea')}
          detail={
            state.rawFeatureText?.trim()
              ? t('projectControl.editable')
              : t('projectControl.none')
          }
          onClick={() => onSelect({ kind: 'source', view: 'raw-fea' })}
        />
        <OutlineButton
          isSelected={isSourceSelected(selected, 'imported-tables')}
          label={t('projectControl.importedTables')}
          detail={`${sourceSections.filter((section) => section.kind === 'compiled-table').length} ${t('projectControl.sourceSections')}`}
          onClick={() => onSelect({ kind: 'source', view: 'imported-tables' })}
        />
      </OutlineSection>
      <OutlineSection title={t('projectControl.prefixes')}>
        <OutlineButton
          isSelected={isPrefixSelected(selected, 'languagesystems')}
          label={t('projectControl.languageSystems')}
          detail={`${state.languagesystems.length}`}
          onClick={() => onSelect({ kind: 'prefix', view: 'languagesystems' })}
        />
        <OutlineButton
          isSelected={isPrefixSelected(selected, 'glyph-classes')}
          label={t('projectControl.glyphClasses')}
          detail={`${state.glyphClasses.length}`}
          onClick={() => onSelect({ kind: 'prefix', view: 'glyph-classes' })}
        />
        <OutlineButton
          isSelected={isPrefixSelected(selected, 'mark-classes')}
          label={t('projectControl.markClasses')}
          detail={`${state.markClasses.length}`}
          onClick={() => onSelect({ kind: 'prefix', view: 'mark-classes' })}
        />
        <OutlineButton
          isSelected={isPrefixSelected(selected, 'gdef')}
          label={t('projectControl.gdef')}
          detail={
            state.gdef
              ? t('projectControl.recognized')
              : t('projectControl.none')
          }
          onClick={() => onSelect({ kind: 'prefix', view: 'gdef' })}
        />
      </OutlineSection>
      <OutlineSection title={t('projectControl.featuresSection')}>
        {state.features.length === 0 ? (
          <Text fontSize="sm" color="mutedForeground">
            {t('projectControl.noFeaturesYet')}
          </Text>
        ) : (
          state.features.map((feature) => (
            <OutlineButton
              key={feature.id}
              isSelected={
                selected.kind === 'feature' && selected.featureId === feature.id
              }
              label={feature.tag}
              detail={getFeatureDetail(feature)}
              metaBadge={getFeatureTable(feature)}
              badge={diagnosticsForFeature(diagnostics, feature.id)}
              onClick={() =>
                onSelect({ kind: 'feature', featureId: feature.id })
              }
            />
          ))
        )}
      </OutlineSection>
      <OutlineSection title={t('projectControl.usedLayoutTables')}>
        {tableSummaries.length === 0 ? (
          <Text fontSize="sm" color="mutedForeground">
            {t('projectControl.noUsedLayoutTables')}
          </Text>
        ) : (
          tableSummaries.map((summary) => (
            <OutlineButton
              key={summary.table}
              isSelected={
                selected.kind === 'table' && selected.table === summary.table
              }
              label={summary.table}
              detail={`${summary.lookupCount} ${t('projectControl.lookups')} / ${summary.sourceCount} ${t('projectControl.sourceSections')}`}
              badge={summary.unsupportedCount}
              onClick={() => onSelect({ kind: 'table', table: summary.table })}
            />
          ))
        )}
      </OutlineSection>
      <OutlineSection title={t('projectControl.build')}>
        <OutlineButton
          isSelected={isBuildSelected(selected, 'generated-fea')}
          label={t('projectControl.generatedFea')}
          detail={t('projectControl.generatedDisposableFea')}
          onClick={() => onSelect({ kind: 'build', view: 'generated-fea' })}
        />
        <OutlineButton
          isSelected={isBuildSelected(selected, 'export-policy')}
          label={t('projectControl.exportPolicy')}
          detail={state.exportPolicy}
          onClick={() => onSelect({ kind: 'build', view: 'export-policy' })}
        />
        <OutlineButton
          isSelected={isBuildSelected(selected, 'diagnostics')}
          label={t('projectControl.diagnostics')}
          detail={`${diagnostics.length} ${t('projectControl.diagnosticsLowercase')}`}
          badge={diagnosticsForWorkflow(diagnostics)}
          onClick={() => onSelect({ kind: 'build', view: 'diagnostics' })}
        />
        <OutlineButton
          isSelected={isBuildSelected(selected, 'suggestions')}
          label={t('projectControl.suggestions')}
          detail={`${suggestionsCount}`}
          onClick={() => onSelect({ kind: 'build', view: 'suggestions' })}
        />
      </OutlineSection>
    </Stack>
  )
}

function OutlineSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <Stack gap={2}>
      <Text fontSize="xs" fontWeight="900" color="mutedForeground">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function OutlineButton({
  badge = 0,
  detail,
  isSelected,
  label,
  metaBadge,
  onClick,
}: {
  badge?: number
  detail: string
  isSelected: boolean
  label: string
  metaBadge?: string
  onClick: () => void
}) {
  return (
    <Button
      h="auto"
      justifyContent="flex-start"
      p={2}
      textAlign="left"
      variant={isSelected ? 'solid' : 'ghost'}
      whiteSpace="normal"
      onClick={onClick}
    >
      <Stack gap={1} align="stretch" w="100%">
        <HStack justify="space-between" minW={0}>
          <HStack minW={0} gap={2}>
            <Text fontFamily="mono" fontWeight="900" lineClamp={1}>
              {label}
            </Text>
            {metaBadge ? (
              <Badge flexShrink={0} variant="outline">
                {metaBadge}
              </Badge>
            ) : null}
          </HStack>
          {badge > 0 ? (
            <Badge flexShrink={0} colorPalette="yellow">
              {badge}
            </Badge>
          ) : null}
        </HStack>
        <Text fontSize="xs" color={isSelected ? undefined : 'mutedForeground'}>
          {detail}
        </Text>
      </Stack>
    </Button>
  )
}
