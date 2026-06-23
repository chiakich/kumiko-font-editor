import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import { LookupInspector } from 'src/features/common/projectControl/fontSettings/features/components/LookupInspector'
import { SourceReferenceSummary } from 'src/features/common/projectControl/fontSettings/features/components/SourceReferenceSummary'
import {
  findOpenTypeSourceSectionsForRecord,
  type FeatureDiagnostic,
  type FeatureRecord,
  type LookupRecord,
  type OpenTypeFeaturesState,
  type Rule,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface FeatureDetailPanelProps {
  diagnostics: FeatureDiagnostic[]
  feature: FeatureRecord
  state: OpenTypeFeaturesState
  onRuleChange: (lookupId: string, rule: Rule) => void
}

export function FeatureDetailPanel({
  diagnostics,
  feature,
  state,
  onRuleChange,
}: FeatureDetailPanelProps) {
  const { t } = useTranslation()

  const lookups = getFeatureLookups(feature, state.lookups)
  const featureSourceSectionRecords = findOpenTypeSourceSectionsForRecord(
    state,
    {
      kind: 'feature',
      id: feature.id,
    }
  )

  return (
    <Stack spacing={4}>
      <HStack justify="space-between" align="flex-start">
        <Stack spacing={1}>
          <HStack>
            <Text fontSize="lg" fontFamily="mono" fontWeight="900">
              {feature.tag}
            </Text>
            <Badge>{feature.origin}</Badge>
            {!feature.isActive ? (
              <Badge colorScheme="gray">{t('projectControl.inactive')}</Badge>
            ) : null}
          </HStack>
          <Text fontSize="sm" color="field.muted">
            {t('projectControl.featureCodeIsOrganizedByScript')}
          </Text>
        </Stack>
      </HStack>

      <SourceReferenceSummary
        sourceSectionRecords={featureSourceSectionRecords}
      />

      <FeatureEntries feature={feature} lookups={state.lookups} />

      <LookupInspector
        state={state}
        lookups={lookups}
        title={t('projectControl.featureCodeLookups')}
        emptyMessage="This feature does not reference any lookups."
        diagnostics={diagnostics}
        onRuleChange={onRuleChange}
      />
    </Stack>
  )
}

function FeatureEntries({
  feature,
  lookups,
}: {
  feature: FeatureRecord
  lookups: LookupRecord[]
}) {
  const { t } = useTranslation()

  const lookupById = new Map(lookups.map((lookup) => [lookup.id, lookup]))

  return (
    <Stack spacing={2}>
      <Text fontSize="xs" fontWeight="900" color="field.muted">
        {t('projectControl.scriptLanguageEntries')}
      </Text>
      {feature.entries.map((entry) => (
        <Stack
          key={entry.id}
          spacing={2}
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <HStack>
            <Badge fontFamily="mono">{entry.script}</Badge>
            <Badge fontFamily="mono">{entry.language}</Badge>
          </HStack>
          <HStack wrap="wrap">
            {entry.lookupIds.length === 0 ? (
              <Text fontSize="sm" color="field.muted">
                {t('projectControl.noReferencedLookups')}
              </Text>
            ) : (
              entry.lookupIds.map((lookupId) => {
                const lookup = lookupById.get(lookupId)
                return (
                  <Badge key={lookupId} fontFamily="mono">
                    {lookup?.name ?? lookupId}
                  </Badge>
                )
              })
            )}
          </HStack>
        </Stack>
      ))}
    </Stack>
  )
}

function getFeatureLookups(feature: FeatureRecord, lookups: LookupRecord[]) {
  const lookupById = new Map(lookups.map((lookup) => [lookup.id, lookup]))
  const seen = new Set<string>()
  const featureLookups: LookupRecord[] = []
  for (const lookupId of feature.entries.flatMap((entry) => entry.lookupIds)) {
    if (seen.has(lookupId)) continue
    const lookup = lookupById.get(lookupId)
    if (lookup) {
      featureLookups.push(lookup)
      seen.add(lookupId)
    }
  }
  return featureLookups
}
