import {
  Badge,
  Button,
  HStack,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import type {
  FeatureDiagnostic,
  FeatureSourceSection,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures'
import { RuleEditorList } from 'src/features/common/projectControl/fontSettings/features/components/RuleEditorList'
import { useTranslation } from 'react-i18next'

interface LookupInspectorProps {
  state: OpenTypeFeaturesState
  diagnostics: FeatureDiagnostic[]
  lookups?: LookupRecord[]
  title?: string
  emptyMessage?: string
  onRuleChange: (lookupId: string, rule: Rule) => void
}

export function LookupInspector({
  state,
  diagnostics,
  lookups = state.lookups,
  title = 'Lookups',
  emptyMessage = 'No lookups in the canonical feature model yet.',
  onRuleChange,
}: LookupInspectorProps) {
  const [selectedLookupId, setSelectedLookupId] = useState<string | null>(null)
  const selectedLookup = useMemo(
    () =>
      lookups.find((lookup) => lookup.id === selectedLookupId) ??
      lookups[0] ??
      null,
    [lookups, selectedLookupId]
  )

  if (lookups.length === 0) {
    return (
      <Stack spacing={2}>
        <Text fontWeight="semibold">{title}</Text>
        <Text fontSize="sm" color="field.muted">
          {emptyMessage}
        </Text>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Text fontWeight="semibold">{title}</Text>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
        <LookupList
          lookups={lookups}
          selectedLookupId={selectedLookup?.id ?? null}
          diagnostics={diagnostics}
          onSelect={setSelectedLookupId}
        />
        {selectedLookup ? (
          <LookupDetails
            lookup={selectedLookup}
            diagnostics={diagnostics}
            sourceSections={state.sourceSections}
            onRuleChange={onRuleChange}
          />
        ) : null}
      </SimpleGrid>
    </Stack>
  )
}

interface LookupListProps {
  lookups: LookupRecord[]
  selectedLookupId: string | null
  diagnostics: FeatureDiagnostic[]
  onSelect: (lookupId: string) => void
}

function LookupList({
  lookups,
  selectedLookupId,
  diagnostics,
  onSelect,
}: LookupListProps) {
  return (
    <Stack spacing={2}>
      {lookups.map((lookup) => (
        <Button
          key={lookup.id}
          variant={lookup.id === selectedLookupId ? 'solid' : 'outline'}
          justifyContent="space-between"
          h="auto"
          py={3}
          whiteSpace="normal"
          onClick={() => onSelect(lookup.id)}
        >
          <Stack spacing={1} align="flex-start">
            <HStack>
              <Text fontSize="sm" fontFamily="mono" fontWeight="900">
                {lookup.name}
              </Text>
              <Badge>{lookup.table}</Badge>
            </HStack>
            <Text fontSize="xs">{lookup.lookupType}</Text>
          </Stack>
          <LookupBadges
            lookup={lookup}
            diagnostics={diagnosticsForLookup(diagnostics, lookup.id)}
          />
        </Button>
      ))}
    </Stack>
  )
}

interface LookupDetailsProps {
  lookup: LookupRecord
  diagnostics: FeatureDiagnostic[]
  sourceSections: FeatureSourceSection[]
  onRuleChange: (lookupId: string, rule: Rule) => void
}

function LookupDetails({
  lookup,
  diagnostics,
  sourceSections,
  onRuleChange,
}: LookupDetailsProps) {
  const lookupDiagnostics = diagnosticsForLookup(diagnostics, lookup.id)
  const lookupSourceSections = sourceSectionsForLookup(sourceSections, lookup)

  return (
    <Stack spacing={3} borderWidth="1px" borderRadius="sm" p={3}>
      <HStack justify="space-between" align="flex-start">
        <Stack spacing={1}>
          <Text fontWeight="semibold" fontFamily="mono">
            {lookup.name}
          </Text>
          <Text fontSize="sm" color="field.muted">
            {lookup.table} / {lookup.lookupType}
          </Text>
        </Stack>
        <LookupBadges lookup={lookup} diagnostics={lookupDiagnostics} />
      </HStack>
      <LookupFlags lookup={lookup} />
      <ProvenanceSummary lookup={lookup} />
      <SourceReferenceSummary sourceSections={lookupSourceSections} />
      {lookupDiagnostics.length > 0 ? (
        <Stack spacing={1}>
          {lookupDiagnostics.map((diagnostic) => (
            <Text key={diagnostic.id} fontSize="xs" color="field.muted">
              {diagnostic.severity}: {diagnostic.message}
            </Text>
          ))}
        </Stack>
      ) : null}
      <RuleEditorList
        lookup={lookup}
        onRuleChange={(rule) => onRuleChange(lookup.id, rule)}
      />
    </Stack>
  )
}

function LookupBadges({
  lookup,
  diagnostics,
}: {
  lookup: LookupRecord
  diagnostics: FeatureDiagnostic[]
}) {
  const { t } = useTranslation()

  return (
    <HStack justify="flex-end" wrap="wrap">
      <Badge colorScheme={lookup.editable ? 'green' : 'orange'}>
        {lookup.editable ? 'editable' : 'inspect only'}
      </Badge>
      <Badge>{lookup.origin}</Badge>
      {diagnostics.length > 0 ? (
        <Badge colorScheme="yellow">
          {diagnostics.length} {t('projectControl.diagnosticsLowercase')}
        </Badge>
      ) : null}
    </HStack>
  )
}

function LookupFlags({ lookup }: { lookup: LookupRecord }) {
  const { t } = useTranslation()

  const activeFlags = Object.entries(lookup.lookupFlag)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)

  return (
    <Stack spacing={1}>
      <Text fontSize="xs" color="field.muted">
        {t('projectControl.lookupFlags')}
      </Text>
      <HStack wrap="wrap">
        {activeFlags.length === 0 ? (
          <Badge colorScheme="gray">{t('projectControl.none')}</Badge>
        ) : (
          activeFlags.map((flag) => <Badge key={flag}>{flag}</Badge>)
        )}
        {lookup.markFilteringSetClassId ? (
          <Badge>{lookup.markFilteringSetClassId}</Badge>
        ) : null}
      </HStack>
    </Stack>
  )
}

function ProvenanceSummary({ lookup }: { lookup: LookupRecord }) {
  const { t } = useTranslation()
  const subtableFormats = lookup.meta?.subtableFormats
  const subtableFormatText = Array.isArray(subtableFormats)
    ? subtableFormats.filter((format) => typeof format === 'number').join(', ')
    : ''

  if (!lookup.provenance && !subtableFormatText) {
    return null
  }

  return (
    <Stack spacing={1}>
      <Text fontSize="xs" color="field.muted">
        {t('projectControl.importedFrom')}
      </Text>
      <HStack wrap="wrap">
        {lookup.provenance?.table ? (
          <Badge>{lookup.provenance.table}</Badge>
        ) : null}
        {lookup.provenance?.featureTag ? (
          <Badge fontFamily="mono">{lookup.provenance.featureTag}</Badge>
        ) : null}
        {lookup.provenance?.lookupIndex === undefined ? null : (
          <Badge>lookup {lookup.provenance.lookupIndex}</Badge>
        )}
        {lookup.provenance?.lookupType === undefined ? null : (
          <Badge>type {lookup.provenance.lookupType}</Badge>
        )}
        {lookup.provenance?.subtableIndex === undefined ? null : (
          <Badge>subtable {lookup.provenance.subtableIndex}</Badge>
        )}
        {lookup.provenance?.subtableFormat === undefined ? null : (
          <Badge>format {lookup.provenance.subtableFormat}</Badge>
        )}
        {subtableFormatText ? (
          <Badge>
            {t('projectControl.subtableFormats')} {subtableFormatText}
          </Badge>
        ) : null}
      </HStack>
    </Stack>
  )
}

function SourceReferenceSummary({
  sourceSections,
}: {
  sourceSections: FeatureSourceSection[]
}) {
  const { t } = useTranslation()

  if (sourceSections.length === 0) {
    return null
  }

  return (
    <Stack spacing={1}>
      <Text fontSize="xs" color="field.muted">
        {t('projectControl.sourceSections')}
      </Text>
      <HStack wrap="wrap">
        {sourceSections.map((section) => (
          <Badge key={section.id} variant="outline">
            {section.table ? `${section.table} ` : ''}
            {section.status}
          </Badge>
        ))}
      </HStack>
    </Stack>
  )
}

function diagnosticsForLookup(
  diagnostics: FeatureDiagnostic[],
  lookupId: string
) {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.target.kind === 'lookup' &&
      diagnostic.target.lookupId === lookupId
  )
}

function sourceSectionsForLookup(
  sourceSections: FeatureSourceSection[],
  lookup: LookupRecord
) {
  return sourceSections.filter((section) =>
    section.recordRefs.some(
      (ref) =>
        ref.kind === 'lookup' &&
        ref.id === lookup.id &&
        (!ref.table || ref.table === lookup.table)
    )
  )
}
