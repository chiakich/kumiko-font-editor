import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { LookupRecord, Rule } from 'src/lib/openTypeFeatures'
import { formatRuleSummary } from 'src/features/common/projectControl/fontSettings/features/featureRuleText'
import { LigatureSubstitutionRuleEditor } from 'src/features/common/projectControl/fontSettings/features/LigatureSubstitutionRuleEditor'
import { SingleSubstitutionRuleEditor } from 'src/features/common/projectControl/fontSettings/features/SingleSubstitutionRuleEditor'

interface RuleEditorListProps {
  lookup: LookupRecord
  onRuleChange: (rule: Rule) => void
}

export function RuleEditorList({ lookup, onRuleChange }: RuleEditorListProps) {
  if (!lookup.editable) {
    return (
      <Text fontSize="sm" color="field.muted">
        This lookup can be inspected but not visually edited yet. If you rebuild
        OpenType features on export, unsupported data may be removed.
      </Text>
    )
  }

  const editableRules = lookup.rules.filter(isRuleEditorSupported)

  if (editableRules.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        No visual editor is available for these rule types yet. The rules remain
        visible in the summary above.
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      <Text fontWeight="semibold" fontSize="sm">
        Rule editors
      </Text>
      {editableRules.map((rule) => (
        <Stack
          key={rule.id}
          spacing={2}
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <HStack justify="space-between" align="flex-start">
            <Stack spacing={1}>
              <Badge alignSelf="flex-start">{rule.kind}</Badge>
              <Text fontSize="xs" fontFamily="mono" color="field.muted">
                {formatRuleSummary(rule)}
              </Text>
            </Stack>
            {rule.meta.userOverridden ? (
              <Badge colorScheme="purple">user overridden</Badge>
            ) : null}
          </HStack>
          <RuleEditor rule={rule} onChange={onRuleChange} />
        </Stack>
      ))}
    </Stack>
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
    default:
      return null
  }
}

function isRuleEditorSupported(rule: Rule) {
  return (
    rule.kind === 'singleSubstitution' || rule.kind === 'ligatureSubstitution'
  )
}
