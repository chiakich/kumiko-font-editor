import {
  Badge,
  FormControl,
  FormLabel,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react'
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
}: {
  feature: FeatureRecord
  generatedFea: {
    sourceMap: GeneratedFeaSourceMap
    text: string
  }
  state: OpenTypeFeaturesState
}) {
  const { t } = useTranslation()
  const lookupIds = Array.from(
    new Set(feature.entries.flatMap((entry) => entry.lookupIds))
  )
  const sourceSectionRecords = findOpenTypeSourceSectionsForRecord(state, {
    kind: 'feature',
    id: feature.id,
  })
  const featureFea = extractGeneratedFeaForFeature(generatedFea, feature.id)

  return (
    <Stack spacing={4}>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
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
      <FormControl>
        <FormLabel fontSize="sm">{t('projectControl.featureBlock')}</FormLabel>
        <Textarea
          minH="360px"
          fontFamily="mono"
          value={featureFea || t('projectControl.noFeatureBlock')}
          isReadOnly
        />
      </FormControl>
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
    <Stack spacing={4}>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
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
      <Stack spacing={2}>
        <Text fontSize="sm" fontWeight="semibold">
          {t('projectControl.lookups')}
        </Text>
        {lookups.length === 0 ? (
          <Text fontSize="sm" color="field.muted">
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
              <Stack spacing={1} minW={0}>
                <Text fontFamily="mono" fontWeight="900" noOfLines={1}>
                  {lookup.name}
                </Text>
                <HStack wrap="wrap" gap={1}>
                  <Badge>{lookup.lookupType}</Badge>
                  <Badge variant="outline">{lookup.origin}</Badge>
                  {lookup.editable ? (
                    <Badge colorScheme="green">
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
