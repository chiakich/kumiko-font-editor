import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { LookupRecord, Rule } from 'src/lib/openTypeFeatures'
import { formatRuleSummary } from 'src/features/common/projectControl/fontSettings/features/featureRuleText'
import { LigatureSubstitutionRuleEditor } from 'src/features/common/projectControl/fontSettings/features/LigatureSubstitutionRuleEditor'
import { PairPositioningRuleEditor } from 'src/features/common/projectControl/fontSettings/features/PairPositioningRuleEditor'
import { SinglePositioningRuleEditor } from 'src/features/common/projectControl/fontSettings/features/SinglePositioningRuleEditor'
import { SingleSubstitutionRuleEditor } from 'src/features/common/projectControl/fontSettings/features/SingleSubstitutionRuleEditor'

interface RuleEditorListProps {
  lookup: LookupRecord
  onRuleChange: (rule: Rule) => void
}

export function RuleEditorList({ lookup, onRuleChange }: RuleEditorListProps) {
  if (lookup.rules.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        No rules in this lookup.
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      <Text fontWeight="semibold" fontSize="sm">
        Rules
      </Text>
      {!lookup.editable ? (
        <Text fontSize="sm" color="field.muted">
          This lookup can be inspected but not visually edited yet. If you
          rebuild OpenType features on export, unsupported data may be removed.
        </Text>
      ) : null}
      {lookup.rules.map((rule) => (
        <RuleSurface
          key={rule.id}
          rule={rule}
          lookupEditable={lookup.editable}
          canEdit={lookup.editable && isRuleEditorSupported(rule)}
          onRuleChange={onRuleChange}
        />
      ))}
    </Stack>
  )
}

function RuleSurface({
  rule,
  lookupEditable,
  canEdit,
  onRuleChange,
}: {
  rule: Rule
  lookupEditable: boolean
  canEdit: boolean
  onRuleChange: (rule: Rule) => void
}) {
  return (
    <Stack spacing={2} borderWidth="1px" borderRadius="sm" p={3}>
      <RuleHeader rule={rule} canEdit={canEdit} />
      {canEdit ? (
        <RuleEditor rule={rule} onChange={onRuleChange} />
      ) : (
        <InspectOnlyRule rule={rule} lookupEditable={lookupEditable} />
      )}
    </Stack>
  )
}

function RuleHeader({ rule, canEdit }: { rule: Rule; canEdit: boolean }) {
  return (
    <HStack justify="space-between" align="flex-start">
      <Stack spacing={1}>
        <HStack wrap="wrap">
          <Badge alignSelf="flex-start">{rule.kind}</Badge>
          <Badge colorScheme={canEdit ? 'green' : 'gray'}>
            {canEdit ? 'editable' : 'inspect only'}
          </Badge>
        </HStack>
        <Text fontSize="xs" fontFamily="mono" color="field.muted">
          {formatRuleSummary(rule)}
        </Text>
      </Stack>
      <HStack justify="flex-end" wrap="wrap">
        <Badge colorScheme={rule.meta.userOverridden ? 'purple' : 'gray'}>
          {rule.meta.origin}
        </Badge>
        {rule.meta.userOverridden ? (
          <Badge colorScheme="purple">user overridden</Badge>
        ) : null}
      </HStack>
    </HStack>
  )
}

function InspectOnlyRule({
  rule,
  lookupEditable,
}: {
  rule: Rule
  lookupEditable: boolean
}) {
  const reason = getInspectOnlyReason(rule, lookupEditable)

  return (
    <Text fontSize="xs" color="field.muted">
      {reason}
    </Text>
  )
}

function getInspectOnlyReason(rule: Rule, lookupEditable: boolean) {
  if (!lookupEditable) {
    return (
      rule.meta.reason ??
      'This lookup is inspect-only, so this rule cannot be edited here.'
    )
  }

  return (
    rule.meta.reason ?? 'No visual editor is available for this rule type yet.'
  )
}

function RuleEditor({
  rule,
  onChange,
}: {
  rule: Rule
  onChange: (rule: Rule) => void
}) {
  switch (rule.kind) {
    case 'singleSubstitution':
      return <SingleSubstitutionRuleEditor rule={rule} onChange={onChange} />
    case 'ligatureSubstitution':
      return <LigatureSubstitutionRuleEditor rule={rule} onChange={onChange} />
    case 'pairPositioning':
      return <PairPositioningRuleEditor rule={rule} onChange={onChange} />
    case 'singlePositioning':
      return <SinglePositioningRuleEditor rule={rule} onChange={onChange} />
    default:
      return null
  }
}

function isRuleEditorSupported(rule: Rule) {
  return (
    rule.kind === 'singleSubstitution' ||
    rule.kind === 'ligatureSubstitution' ||
    rule.kind === 'pairPositioning' ||
    rule.kind === 'singlePositioning'
  )
}
