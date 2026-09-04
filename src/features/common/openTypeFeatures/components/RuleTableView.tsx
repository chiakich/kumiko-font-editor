import { Badge, Box, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import type {
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from '@/lib/openTypeFeatures'
import { updateLookupRule } from '@/features/common/openTypeFeatures/utils/ruleEditorState'
import {
  getValueRecordFieldText,
  updateValueRecordField,
} from '@/features/common/openTypeFeatures/utils/valueRecordState'
import { selectorToText } from '@/features/common/openTypeFeatures/utils/ruleSelectorText'

interface RuleTableViewProps {
  state: OpenTypeFeaturesState
  lookupIds: readonly string[]
  onStateChange: (next: OpenTypeFeaturesState) => void
}

interface RuleRow {
  lookup: LookupRecord
  rule: Rule
}

const ruleSummary = (rule: Rule, state: OpenTypeFeaturesState): string => {
  switch (rule.kind) {
    case 'singleSubstitution':
      return `${selectorToText(rule.target, state)} → ${rule.replacement}`
    case 'ligatureSubstitution':
      return `${rule.components.join(' ')} → ${rule.replacement}`
    case 'multipleSubstitution':
      return `${rule.target} → ${rule.replacement.join(' ')}`
    case 'alternateSubstitution':
      return `${rule.target} ← ${rule.alternates.join(' ')}`
    case 'pairPositioning':
      return `${selectorToText(rule.left, state)} ‧ ${selectorToText(rule.right, state)}`
    case 'singlePositioning':
      return selectorToText(rule.target, state)
    default:
      return rule.kind
  }
}

// A flat, filterable table over every rule the feature owns. This is the only
// rendering that survives CJK-scale features — thousands of kern pairs — so
// the list is virtualized and rows stay cheap.
export function RuleTableView({
  state,
  lookupIds,
  onStateChange,
}: RuleTableViewProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const lookupById = new Map(
      state.lookups.map((lookup) => [lookup.id, lookup])
    )
    const collected: RuleRow[] = []
    for (const lookupId of lookupIds) {
      const lookup = lookupById.get(lookupId)
      if (!lookup) {
        continue
      }
      for (const rule of lookup.rules) {
        collected.push({ lookup, rule })
      }
    }
    const query = filter.trim().toLowerCase()
    if (!query) {
      return collected
    }
    return collected.filter((row) =>
      ruleSummary(row.rule, state).toLowerCase().includes(query)
    )
  }, [state, lookupIds, filter])

  return (
    <Stack gap={2} flex={1} minH={0}>
      <HStack gap={2}>
        <Input
          size="xs"
          maxW="280px"
          fontFamily="mono"
          value={filter}
          placeholder={t('projectControl.ruleTableFilter')}
          onChange={(event) => setFilter(event.target.value)}
        />
        <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
          {t('projectControl.ruleTableCount', { count: rows.length })}
        </Text>
      </HStack>
      <Box
        borderWidth="1px"
        borderColor="controlBorder"
        borderRadius="md"
        overflow="hidden"
        height="440px"
      >
        <Virtuoso
          style={{ height: '100%' }}
          totalCount={rows.length}
          itemContent={(index) => {
            const row = rows[index]
            if (!row) {
              return null
            }
            const editable =
              row.lookup.editable && row.rule.kind === 'pairPositioning'
            return (
              <HStack
                gap={3}
                px={3}
                py={1.5}
                borderBottomWidth="1px"
                borderColor="controlBorder"
                fontFamily="mono"
                fontSize="12px"
              >
                <Badge size="sm" variant="outline" flexShrink={0}>
                  {row.rule.kind === 'pairPositioning'
                    ? 'pair'
                    : row.rule.kind === 'singleSubstitution'
                      ? 'single'
                      : row.rule.kind === 'ligatureSubstitution'
                        ? 'liga'
                        : row.rule.kind}
                </Badge>
                <Text lineClamp={1} flex={1} minW={0}>
                  {ruleSummary(row.rule, state)}
                </Text>
                {row.rule.kind === 'pairPositioning' ? (
                  editable ? (
                    <Input
                      size="2xs"
                      width="72px"
                      textAlign="right"
                      fontFamily="mono"
                      aria-label="xAdvance"
                      key={`${row.rule.id}:${getValueRecordFieldText(row.rule.firstValue, 'xAdvance')}`}
                      defaultValue={getValueRecordFieldText(
                        row.rule.firstValue,
                        'xAdvance'
                      )}
                      onBlur={(event) => {
                        if (row.rule.kind !== 'pairPositioning') {
                          return
                        }
                        onStateChange(
                          updateLookupRule(state, row.lookup.id, {
                            ...row.rule,
                            firstValue: updateValueRecordField(
                              row.rule.firstValue,
                              'xAdvance',
                              event.target.value
                            ),
                          })
                        )
                      }}
                    />
                  ) : (
                    <Text
                      width="72px"
                      textAlign="right"
                      color="mutedForeground"
                    >
                      {getValueRecordFieldText(
                        row.rule.firstValue,
                        'xAdvance'
                      ) || '—'}
                    </Text>
                  )
                ) : null}
                <Text
                  fontSize="10px"
                  color="mutedForeground"
                  width="110px"
                  textAlign="right"
                  lineClamp={1}
                  flexShrink={0}
                >
                  {row.lookup.name}
                </Text>
              </HStack>
            )
          }}
        />
      </Box>
    </Stack>
  )
}
