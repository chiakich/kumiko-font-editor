import { FeaCodeEditor } from 'src/features/common/projectControl/fontSettings/features/components/FeaCodeEditor'
import { FeatureRuleEditor } from 'src/features/common/projectControl/fontSettings/features/components/FeatureRuleEditor'
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
} from 'src/features/common/projectControl/fontSettings/features/components/OpenTypeDocumentPrimitives'
import {
  deriveOpenTypeSourceSectionRecords,
  findOpenTypeSourceSectionsForRecord,
  type FeatureRecord,
  type GeneratedFeaSourceMap,
  type OpenTypeFeaturesState,
  type OpenTypeTableTag,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

export function FeatureDocument({
  feature,
  generatedFea,
  state,
  onStateChange,
}: {
  feature: FeatureRecord
  generatedFea: {
    sourceMap: GeneratedFeaSourceMap
    text: string
  }
  state: OpenTypeFeaturesState
  onStateChange?: (next: OpenTypeFeaturesState) => void
}) {
  const { t } = useTranslation()
  // Two views of the same feature: rule cards for the kinds the visual editor
  // understands, the generated FEA block for everything.
  const [mode, setMode] = useState<'visual' | 'code'>('visual')
  const lookupIds = Array.from(
    new Set(feature.entries.flatMap((entry) => entry.lookupIds))
  )
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
