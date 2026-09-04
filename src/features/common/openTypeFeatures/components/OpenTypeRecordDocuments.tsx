import { FeaCodeEditor } from '@/features/common/openTypeFeatures/components/FeaCodeEditor'
import { FeatureRuleEditor } from '@/features/common/openTypeFeatures/components/FeatureRuleEditor'
import { RuleTableView } from '@/features/common/openTypeFeatures/components/RuleTableView'
import { SubstitutionGridView } from '@/features/common/openTypeFeatures/components/SubstitutionGridView'
import {
  Badge,
  Button,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  Field,
} from '@chakra-ui/react'
import { useState } from 'react'
import {
  Metric,
  SourceSectionsDocument,
} from '@/features/common/openTypeFeatures/components/OpenTypeDocumentPrimitives'
import {
  deriveOpenTypeSourceSectionRecords,
  findOpenTypeSourceSectionsForRecord,
  type FeatureRecord,
  type GeneratedFeaSourceMap,
  type OpenTypeFeaturesState,
  type OpenTypeTableTag,
} from '@/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'
import type { FontData } from '@/domain'

export function FeatureDocument({
  feature,
  generatedFea,
  state,
  fontData,
  onStateChange,
}: {
  feature: FeatureRecord
  generatedFea: {
    sourceMap: GeneratedFeaSourceMap
    text: string
  }
  state: OpenTypeFeaturesState
  // Present where the visual editor should offer a glyph picker.
  fontData?: FontData | null
  onStateChange?: (next: OpenTypeFeaturesState) => void
}) {
  const { t } = useTranslation()
  const lookupIds = Array.from(
    new Set(feature.entries.flatMap((entry) => entry.lookupIds))
  )
  const ruleCount = countFeatureRules(feature, state)
  // One-to-one substitution features read best as a before/after proof sheet.
  const lookupByIdForKinds = new Map(
    state.lookups.map((lookup) => [lookup.id, lookup])
  )
  const featureRuleKinds = feature.entries
    .flatMap((entry) => entry.lookupIds)
    .flatMap((lookupId) =>
      (lookupByIdForKinds.get(lookupId)?.rules ?? []).map((rule) => rule.kind)
    )
  const singleSubCount = featureRuleKinds.filter(
    (kind) => kind === 'singleSubstitution'
  ).length
  const hasGrid = singleSubCount > 0
  // Four views of the same feature: rule cards, the substitution proof sheet,
  // a flat virtualized table that survives CJK-scale rule counts, and the
  // generated FEA block. The default follows the feature's dominant shape.
  const [mode, setMode] = useState<'visual' | 'grid' | 'table' | 'code'>(() => {
    if (ruleCount > 100) {
      return singleSubCount * 2 > ruleCount ? 'grid' : 'table'
    }
    return singleSubCount > 0 && singleSubCount === ruleCount
      ? 'grid'
      : 'visual'
  })
  const sourceSectionRecords = findOpenTypeSourceSectionsForRecord(state, {
    kind: 'feature',
    id: feature.id,
  })
  const featureFea = extractGeneratedFeaForFeature(generatedFea, feature.id)

  return (
    <Stack gap={4}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
        <Metric
          label={t('projectControl.scriptLanguageEntries')}
          value={feature.entries.length}
        />
        <Metric label={t('projectControl.lookups')} value={lookupIds.length} />
        <Metric
          label={t('projectControl.rules')}
          value={countFeatureRules(feature, state)}
        />
      </SimpleGrid>
      <HStack gap={1}>
        <Button
          size="2xs"
          variant={mode === 'visual' ? 'solid' : 'outline'}
          onClick={() => setMode('visual')}
        >
          {t('projectControl.featureModeVisual')}
        </Button>
        {hasGrid && fontData ? (
          <Button
            size="2xs"
            variant={mode === 'grid' ? 'solid' : 'outline'}
            onClick={() => setMode('grid')}
          >
            {t('projectControl.featureModeGrid')}
          </Button>
        ) : null}
        {ruleCount > 0 ? (
          <Button
            size="2xs"
            variant={mode === 'table' ? 'solid' : 'outline'}
            onClick={() => setMode('table')}
          >
            {t('projectControl.featureModeTable')}
          </Button>
        ) : null}
        <Button
          size="2xs"
          variant={mode === 'code' ? 'solid' : 'outline'}
          onClick={() => setMode('code')}
        >
          {t('projectControl.featureModeCode')}
        </Button>
      </HStack>
      {mode === 'visual' && onStateChange ? (
        <FeatureRuleEditor
          state={state}
          lookupIds={lookupIds}
          fontData={fontData ?? null}
          feature={feature}
          onStateChange={onStateChange}
        />
      ) : mode === 'grid' && fontData ? (
        <SubstitutionGridView
          state={state}
          lookupIds={lookupIds}
          fontData={fontData}
        />
      ) : mode === 'table' && onStateChange ? (
        <RuleTableView
          state={state}
          lookupIds={lookupIds}
          onStateChange={onStateChange}
        />
      ) : (
        <Field.Root>
          <Field.Label textStyle="label">
            {t('projectControl.featureBlock')}
          </Field.Label>
          <FeaCodeEditor
            value={featureFea || t('projectControl.noFeatureBlock')}
            readOnly
            minHeight="360px"
            aria-label={t('projectControl.featureBlock')}
          />
        </Field.Root>
      )}
      <SourceSectionsDocument
        emptyText={t('projectControl.noSourceSections')}
        sourceSectionRecords={sourceSectionRecords}
      />
    </Stack>
  )
}

export function TableDocument({
  state,
  table,
}: {
  state: OpenTypeFeaturesState
  table: OpenTypeTableTag
}) {
  const { t } = useTranslation()
  const lookups = state.lookups.filter((lookup) => lookup.table === table)
  const unsupportedLookups = state.unsupportedLookups.filter(
    (lookup) => lookup.table === table
  )
  const sourceSectionRecords = deriveOpenTypeSourceSectionRecords(state).filter(
    (group) => group.section.table === table
  )

  return (
    <Stack gap={4}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
        <Metric label={t('projectControl.lookups')} value={lookups.length} />
        <Metric
          label={t('projectControl.unsupported')}
          value={unsupportedLookups.length}
        />
        <Metric
          label={t('projectControl.sourceSections')}
          value={sourceSectionRecords.length}
        />
      </SimpleGrid>
      <Stack gap={2}>
        <Text fontSize="sm" fontWeight="semibold">
          {t('projectControl.lookups')}
        </Text>
        {lookups.length === 0 ? (
          <Text fontSize="sm" color="mutedForeground">
            {t('projectControl.none')}
          </Text>
        ) : (
          lookups.map((lookup) => (
            <HStack
              key={lookup.id}
              justify="space-between"
              borderTopWidth="1px"
              pt={2}
              align="flex-start"
              gap={3}
            >
              <Stack gap={1} minW={0}>
                <Text fontFamily="mono" fontWeight="900" lineClamp={1}>
                  {lookup.name}
                </Text>
                <HStack wrap="wrap" gap={1}>
                  <Badge>{lookup.lookupType}</Badge>
                  <Badge variant="outline">{lookup.origin}</Badge>
                  {lookup.editable ? (
                    <Badge colorPalette="green">
                      {t('projectControl.editable')}
                    </Badge>
                  ) : null}
                </HStack>
              </Stack>
              <Badge flexShrink={0}>
                {lookup.rules.length} {t('projectControl.rules')}
              </Badge>
            </HStack>
          ))
        )}
      </Stack>
      <SourceSectionsDocument
        emptyText={t('projectControl.noSourceSections')}
        sourceSectionRecords={sourceSectionRecords}
      />
    </Stack>
  )
}

function extractGeneratedFeaForFeature(
  generatedFea: { sourceMap: GeneratedFeaSourceMap; text: string },
  featureId: string
) {
  const entry = generatedFea.sourceMap.entries.find(
    (sourceMapEntry) => sourceMapEntry.featureId === featureId
  )
  if (!entry) return ''

  const lines = generatedFea.text.split('\n')
  const startIndex = Math.max(entry.lineStart - 2, 0)
  return lines.slice(startIndex, entry.lineEnd).join('\n')
}

function countFeatureRules(
  feature: FeatureRecord,
  state: OpenTypeFeaturesState
) {
  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  return feature.entries
    .flatMap((entry) => entry.lookupIds)
    .reduce((total, lookupId) => {
      const lookup = lookupById.get(lookupId)
      return total + (lookup?.rules.length ?? 0)
    }, 0)
}
