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
  LookupRecord,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { RuleListSummary } from 'src/features/common/projectControl/fontSettings/features/RuleListSummary'

interface LookupInspectorProps {
  state: OpenTypeFeaturesState
  diagnostics: FeatureDiagnostic[]
}

export function LookupInspector({ state, diagnostics }: LookupInspectorProps) {
  const [selectedLookupId, setSelectedLookupId] = useState<string | null>(null)
  const selectedLookup = useMemo(
    () =>
      state.lookups.find((lookup) => lookup.id === selectedLookupId) ??
      state.lookups[0] ??
      null,
    [selectedLookupId, state.lookups]
  )

  if (state.lookups.length === 0) {
    return (
      <Stack spacing={2}>
        <Text fontWeight="semibold">Lookups</Text>
        <Text fontSize="sm" color="field.muted">
          No lookups in the canonical feature model yet.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Text fontWeight="semibold">Lookups</Text>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={3}>
        <LookupList
          lookups={state.lookups}
          selectedLookupId={selectedLookup?.id ?? null}
          diagnostics={diagnostics}
          onSelect={setSelectedLookupId}
        />
        {selectedLookup ? (
          <LookupDetails lookup={selectedLookup} diagnostics={diagnostics} />
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
}

function LookupDetails({ lookup, diagnostics }: LookupDetailsProps) {
  const lookupDiagnostics = diagnosticsForLookup(diagnostics, lookup.id)

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
      {lookupDiagnostics.length > 0 ? (
        <Stack spacing={1}>
          {lookupDiagnostics.map((diagnostic) => (
            <Text key={diagnostic.id} fontSize="xs" color="field.muted">
              {diagnostic.severity}: {diagnostic.message}
            </Text>
          ))}
        </Stack>
      ) : null}
      <RuleListSummary rules={lookup.rules} />
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
  return (
    <HStack justify="flex-end" wrap="wrap">
      <Badge colorScheme={lookup.editable ? 'green' : 'orange'}>
        {lookup.editable ? 'editable' : 'inspect only'}
      </Badge>
      <Badge>{lookup.origin}</Badge>
      {diagnostics.length > 0 ? (
        <Badge colorScheme="yellow">{diagnostics.length} diagnostics</Badge>
      ) : null}
    </HStack>
  )
}

function LookupFlags({ lookup }: { lookup: LookupRecord }) {
  const activeFlags = Object.entries(lookup.lookupFlag)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)

  return (
    <Stack spacing={1}>
      <Text fontSize="xs" color="field.muted">
        Lookup flags
      </Text>
      <HStack wrap="wrap">
        {activeFlags.length === 0 ? (
          <Badge colorScheme="gray">none</Badge>
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
  if (!lookup.provenance) {
    return null
  }

  return (
    <Text fontSize="xs" color="field.muted">
      Imported from {lookup.provenance.table}
      {lookup.provenance.lookupIndex === undefined
        ? ''
        : ` lookup ${lookup.provenance.lookupIndex}`}
      {lookup.provenance.featureTag ? ` / ${lookup.provenance.featureTag}` : ''}
    </Text>
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
