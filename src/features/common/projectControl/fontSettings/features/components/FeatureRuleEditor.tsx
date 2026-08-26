import { Badge, Box, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import type {
  GlyphSelector,
  LigatureSubstitutionRule,
  LookupRecord,
  OpenTypeFeaturesState,
  PairPositioningRule,
  Rule,
  SingleSubstitutionRule,
  ValueRecord,
} from 'src/lib/openTypeFeatures'
import { updateLookupRule } from 'src/features/common/projectControl/fontSettings/features/utils/ruleEditorState'
import {
  getValueRecordFieldText,
  updateValueRecordField,
  type ValueRecordField,
} from 'src/features/common/projectControl/fontSettings/features/utils/valueRecordState'

interface FeatureRuleEditorProps {
  state: OpenTypeFeaturesState
  lookupIds: readonly string[]
  onStateChange: (next: OpenTypeFeaturesState) => void
}

// "@Name" in a selector field means a class; anything else is a glyph name.
// The mapping goes through class *names* here because that is what people
// type, while the IR stores class ids.
const selectorToText = (
  selector: GlyphSelector,
  state: OpenTypeFeaturesState
) => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const glyphClass = state.glyphClasses.find(
    (candidate) => candidate.id === selector.classId
  )
  return `@${glyphClass?.name ?? selector.classId}`
}

const textToSelector = (
  text: string,
  state: OpenTypeFeaturesState
): GlyphSelector | null => {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('@')) {
    const name = trimmed.slice(1)
    const glyphClass = state.glyphClasses.find(
      (candidate) => candidate.name === name
    )
    return glyphClass ? { kind: 'class', classId: glyphClass.id } : null
  }
  return { kind: 'glyph', glyph: trimmed }
}

function SelectorInput({
  value,
  state,
  disabled,
  onCommit,
  'aria-label': ariaLabel,
}: {
  value: GlyphSelector
  state: OpenTypeFeaturesState
  disabled?: boolean
  onCommit: (selector: GlyphSelector) => void
  'aria-label': string
}) {
  return (
    <Input
      size="xs"
      fontFamily="mono"
      defaultValue={selectorToText(value, state)}
      key={selectorToText(value, state)}
      disabled={disabled}
      aria-label={ariaLabel}
      onBlur={(event) => {
        const selector = textToSelector(event.target.value, state)
        if (selector) {
          onCommit(selector)
        } else {
          // Nothing valid to commit; show the stored value again.
          event.target.value = selectorToText(value, state)
        }
      }}
    />
  )
}

function GlyphNameInput({
  value,
  disabled,
  onCommit,
  'aria-label': ariaLabel,
}: {
  value: string
  disabled?: boolean
  onCommit: (glyph: string) => void
  'aria-label': string
}) {
  return (
    <Input
      size="xs"
      fontFamily="mono"
      defaultValue={value}
      key={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onBlur={(event) => {
        const trimmed = event.target.value.trim()
        if (trimmed) {
          onCommit(trimmed)
        } else {
          event.target.value = value
        }
      }}
    />
  )
}

const VALUE_FIELDS: Array<{ field: ValueRecordField; label: string }> = [
  { field: 'xAdvance', label: 'xAdv' },
  { field: 'xPlacement', label: 'xPos' },
  { field: 'yPlacement', label: 'yPos' },
  { field: 'yAdvance', label: 'yAdv' },
]

function ValueRecordFields({
  value,
  disabled,
  onCommit,
}: {
  value: ValueRecord | undefined
  disabled?: boolean
  onCommit: (next: ValueRecord | undefined) => void
}) {
  return (
    <HStack gap={1.5}>
      {VALUE_FIELDS.map(({ field, label }) => (
        <HStack key={field} gap={1}>
          <Text fontSize="10px" color="mutedForeground" fontFamily="mono">
            {label}
          </Text>
          <Input
            size="xs"
            width="56px"
            fontFamily="mono"
            textAlign="right"
            defaultValue={getValueRecordFieldText(value, field)}
            key={`${field}:${getValueRecordFieldText(value, field)}`}
            disabled={disabled}
            aria-label={label}
            onBlur={(event) =>
              onCommit(updateValueRecordField(value, field, event.target.value))
            }
          />
        </HStack>
      ))}
    </HStack>
  )
}

function SingleSubstitutionCard({
  rule,
  state,
  disabled,
  onRuleChange,
}: {
  rule: SingleSubstitutionRule
  state: OpenTypeFeaturesState
  disabled?: boolean
  onRuleChange: (next: Rule) => void
}) {
  const { t } = useTranslation()
  return (
    <HStack gap={2} wrap="wrap">
      <Badge variant="outline" fontFamily="mono">
        sub
      </Badge>
      <SelectorInput
        value={rule.target}
        state={state}
        disabled={disabled}
        aria-label={t('projectControl.ruleTarget')}
        onCommit={(target) => onRuleChange({ ...rule, target })}
      />
      <Text fontSize="xs" color="mutedForeground">
        →
      </Text>
      <GlyphNameInput
        value={rule.replacement}
        disabled={disabled}
        aria-label={t('projectControl.ruleReplacement')}
        onCommit={(replacement) => onRuleChange({ ...rule, replacement })}
      />
    </HStack>
  )
}

function LigatureSubstitutionCard({
  rule,
  disabled,
  onRuleChange,
}: {
  rule: LigatureSubstitutionRule
  disabled?: boolean
  onRuleChange: (next: Rule) => void
}) {
  const { t } = useTranslation()
  return (
    <HStack gap={2} wrap="wrap">
      <Badge variant="outline" fontFamily="mono">
        liga
      </Badge>
      <GlyphNameInput
        value={rule.components.join(' ')}
        disabled={disabled}
        aria-label={t('projectControl.ruleComponents')}
        onCommit={(text) =>
          onRuleChange({
            ...rule,
            components: text.split(/\s+/).filter(Boolean),
          })
        }
      />
      <Text fontSize="xs" color="mutedForeground">
        →
      </Text>
      <GlyphNameInput
        value={rule.replacement}
        disabled={disabled}
        aria-label={t('projectControl.ruleReplacement')}
        onCommit={(replacement) => onRuleChange({ ...rule, replacement })}
      />
    </HStack>
  )
}

function PairPositioningCard({
  rule,
  state,
  disabled,
  onRuleChange,
}: {
  rule: PairPositioningRule
  state: OpenTypeFeaturesState
  disabled?: boolean
  onRuleChange: (next: Rule) => void
}) {
  const { t } = useTranslation()
  return (
    <Stack gap={1.5}>
      <HStack gap={2} wrap="wrap">
        <Badge variant="outline" fontFamily="mono">
          pos
        </Badge>
        <SelectorInput
          value={rule.left}
          state={state}
          disabled={disabled}
          aria-label={t('projectControl.ruleLeft')}
          onCommit={(left) => onRuleChange({ ...rule, left })}
        />
        <SelectorInput
          value={rule.right}
          state={state}
          disabled={disabled}
          aria-label={t('projectControl.ruleRight')}
          onCommit={(right) => onRuleChange({ ...rule, right })}
        />
      </HStack>
      <ValueRecordFields
        value={rule.firstValue}
        disabled={disabled}
        onCommit={(firstValue) => onRuleChange({ ...rule, firstValue })}
      />
    </Stack>
  )
}

function RuleCard({
  rule,
  state,
  disabled,
  onRuleChange,
}: {
  rule: Rule
  state: OpenTypeFeaturesState
  disabled?: boolean
  onRuleChange: (next: Rule) => void
}) {
  const { t } = useTranslation()
  if (rule.kind === 'singleSubstitution') {
    return (
      <SingleSubstitutionCard
        rule={rule}
        state={state}
        disabled={disabled}
        onRuleChange={onRuleChange}
      />
    )
  }
  if (rule.kind === 'ligatureSubstitution') {
    return (
      <LigatureSubstitutionCard
        rule={rule}
        disabled={disabled}
        onRuleChange={onRuleChange}
      />
    )
  }
  if (rule.kind === 'pairPositioning') {
    return (
      <PairPositioningCard
        rule={rule}
        state={state}
        disabled={disabled}
        onRuleChange={onRuleChange}
      />
    )
  }
  return (
    <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
      {t('projectControl.ruleKindNotEditable', { kind: rule.kind })}
    </Text>
  )
}

function LookupCard({
  lookup,
  state,
  onStateChange,
}: {
  lookup: LookupRecord
  state: OpenTypeFeaturesState
  onStateChange: (next: OpenTypeFeaturesState) => void
}) {
  const { t } = useTranslation()
  const disabled = !lookup.editable

  return (
    <Stack gap={2} borderWidth="1px" borderRadius="md" p={3}>
      <HStack gap={2} wrap="wrap">
        <Text fontSize="xs" fontWeight={700} fontFamily="mono">
          {lookup.name}
        </Text>
        <Badge size="sm" variant="outline">
          {lookup.table} · {lookup.lookupType}
        </Badge>
        <Badge size="sm" variant="subtle">
          {t('projectControl.ruleCount', { count: lookup.rules.length })}
        </Badge>
        {disabled ? (
          <Badge size="sm" colorPalette="orange">
            {t('projectControl.lookupReadOnly')}
          </Badge>
        ) : null}
      </HStack>
      {lookup.rules.length === 0 ? (
        <Text fontSize="xs" color="mutedForeground">
          {t('projectControl.noRules')}
        </Text>
      ) : (
        <Stack gap={2} separator={<Box borderBottomWidth="1px" />}>
          {lookup.rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              state={state}
              disabled={disabled}
              onRuleChange={(next) =>
                onStateChange(updateLookupRule(state, lookup.id, next))
              }
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

// The visual half of the per-feature editor: one card per lookup, one row per
// rule, editable for the rule kinds the visual editor understands so far
// (single/ligature substitution and pair positioning — contextual stays code).
export function FeatureRuleEditor({
  state,
  lookupIds,
  onStateChange,
}: FeatureRuleEditorProps) {
  const { t } = useTranslation()
  const lookups = lookupIds
    .map((lookupId) => state.lookups.find((lookup) => lookup.id === lookupId))
    .filter((lookup): lookup is LookupRecord => Boolean(lookup))

  if (lookups.length === 0) {
    return (
      <Text fontSize="sm" color="mutedForeground">
        {t('projectControl.noLookupsForFeature')}
      </Text>
    )
  }

  return (
    <Stack gap={3}>
      {lookups.map((lookup) => (
        <LookupCard
          key={lookup.id}
          lookup={lookup}
          state={state}
          onStateChange={onStateChange}
        />
      ))}
    </Stack>
  )
}
