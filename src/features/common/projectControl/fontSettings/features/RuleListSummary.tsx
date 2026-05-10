import { Badge, HStack, Stack, Text } from '@chakra-ui/react'
import type { Rule } from 'src/lib/openTypeFeatures'
import { formatRuleSummary } from 'src/features/common/projectControl/fontSettings/features/featureRuleText'

interface RuleListSummaryProps {
  rules: Rule[]
}

export function RuleListSummary({ rules }: RuleListSummaryProps) {
  if (rules.length === 0) {
    return (
      <Text fontSize="sm" color="field.muted">
        No rules in this lookup.
      </Text>
    )
  }

  return (
    <Stack spacing={2}>
      {rules.map((rule) => (
        <Stack
          key={rule.id}
          spacing={1}
          borderWidth="1px"
          borderRadius="sm"
          p={3}
        >
          <HStack justify="space-between" align="flex-start">
            <Badge alignSelf="flex-start">{rule.kind}</Badge>
            <Badge colorScheme={rule.meta.userOverridden ? 'purple' : 'gray'}>
              {rule.meta.origin}
            </Badge>
          </HStack>
          <Text fontSize="sm" fontFamily="mono">
            {formatRuleSummary(rule)}
          </Text>
          {rule.meta.reason ? (
            <Text fontSize="xs" color="field.muted">
              {rule.meta.reason}
            </Text>
          ) : null}
        </Stack>
      ))}
    </Stack>
  )
}
