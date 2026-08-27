import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GlyphPickerPopover } from 'src/features/common/projectControl/fontSettings/features/components/GlyphPickerPopover'
import {
  selectorToText,
  textToSelector,
} from 'src/features/common/projectControl/fontSettings/features/utils/ruleSelectorText'
import type {
  FeatureRecord,
  GlyphSelector,
  LigatureSubstitutionRule,
  LookupRecord,
  OpenTypeFeaturesState,
  PairPositioningRule,
  Rule,
  SingleSubstitutionRule,
  ValueRecord,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { updateLookupRule } from 'src/features/common/projectControl/fontSettings/features/utils/ruleEditorState'
import {
  addRuleToFeature,
  deleteLookupRule,
  type CreatableRuleKind,
} from 'src/features/common/projectControl/fontSettings/features/utils/featureAuthoring'
import {
  getValueRecordFieldText,
  updateValueRecordField,
  type ValueRecordField,
} from 'src/features/common/projectControl/fontSettings/features/utils/valueRecordState'

interface FeatureRuleEditorProps {
  state: OpenTypeFeaturesState
  lookupIds: readonly string[]
  // Present where glyph fields should offer the picker.
  fontData?: FontData | null
  // When present the editor offers creating new rules on this feature.
  feature?: FeatureRecord
  onStateChange: (next: OpenTypeFeaturesState) => void
}

// A text field plus the glyph picker: unencoded glyphs cannot be typed, so
// every glyph field offers choosing over spelling. Typing stays possible for
// people who know the names.
function GlyphFieldFrame({
  text,
  disabled,
  fontData,
  'aria-label': ariaLabel,
  onCommitText,
  onPickGlyph,
}: {
  text: string
  disabled?: boolean
  fontData: FontData | null
  'aria-label': string
  onCommitText: (value: string, input: HTMLInputElement) => void
  onPickGlyph: (glyphId: string) => void
}) {
  const { t } = useTranslation()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  return (
    <HStack gap={0.5}>
      <Input
        size="xs"
        fontFamily="mono"
        defaultValue={text}
        key={text}
        disabled={disabled}
        aria-label={ariaLabel}
        onBlur={(event) => onCommitText(event.target.value, event.target)}
      />
      {fontData && !disabled ? (
        <IconButton
          size="2xs"
          variant="ghost"
          aria-label={t('projectControl.glyphPickerOpen')}
          onClick={() => setIsPickerOpen(true)}
        >
          ⌕
        </IconButton>
      ) : null}
      {fontData && isPickerOpen ? (
        <GlyphPickerPopover
          fontData={fontData}
          isOpen={isPickerOpen}
          initialQuery={text.startsWith('@') ? '' : text}
          onClose={() => setIsPickerOpen(false)}
          onPick={onPickGlyph}
        />
      ) : null}
    </HStack>
  )
}

function SelectorInput({
  value,
  state,
  disabled,
  fontData,
  onCommit,
  'aria-label': ariaLabel,
}: {
  value: GlyphSelector
  state: OpenTypeFeaturesState
  disabled?: boolean
  fontData: FontData | null
  onCommit: (selector: GlyphSelector) => void
  'aria-label': string
}) {
  return (
    <GlyphFieldFrame
      text={selectorToText(value, state)}
      disabled={disabled}
      fontData={fontData}
      aria-label={ariaLabel}
      onCommitText={(next, input) => {
        const selector = textToSelector(next, state)
        if (selector) {
          onCommit(selector)
        } else {
          // Nothing valid to commit; show the stored value again.
          input.value = selectorToText(value, state)
        }
      }}
      onPickGlyph={(glyphId) => onCommit({ kind: 'glyph', glyph: glyphId })}
    />
  )
}

function GlyphNameInput({
  value,
  disabled,
  fontData,
  onCommit,
  'aria-label': ariaLabel,
}: {
  value: string
  disabled?: boolean
  fontData: FontData | null
  onCommit: (glyph: string) => void
  'aria-label': string
}) {
  return (
    <GlyphFieldFrame
      text={value}
      disabled={disabled}
      fontData={fontData}
      aria-label={ariaLabel}
      onCommitText={(next, input) => {
        const trimmed = next.trim()
        if (trimmed) {
          onCommit(trimmed)
        } else {
          input.value = value
        }
      }}
      onPickGlyph={(glyphId) => onCommit(glyphId)}
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
  fontData,
  onRuleChange,
}: {
  rule: SingleSubstitutionRule
  state: OpenTypeFeaturesState
  disabled?: boolean
  fontData: FontData | null
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
        fontData={fontData}
        aria-label={t('projectControl.ruleTarget')}
        onCommit={(target) => onRuleChange({ ...rule, target })}
      />
      <Text fontSize="xs" color="mutedForeground">
        →
      </Text>
      <GlyphNameInput
        value={rule.replacement}
        disabled={disabled}
        fontData={fontData}
        aria-label={t('projectControl.ruleReplacement')}
        onCommit={(replacement) => onRuleChange({ ...rule, replacement })}
      />
    </HStack>
  )
}

function LigatureSubstitutionCard({
  rule,
  disabled,
  fontData,
  onRuleChange,
}: {
  rule: LigatureSubstitutionRule
  disabled?: boolean
  fontData: FontData | null
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
        fontData={fontData}
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
        fontData={fontData}
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
  fontData,
  onRuleChange,
}: {
  rule: PairPositioningRule
  state: OpenTypeFeaturesState
  disabled?: boolean
  fontData: FontData | null
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
          fontData={fontData}
          aria-label={t('projectControl.ruleLeft')}
          onCommit={(left) => onRuleChange({ ...rule, left })}
        />
        <SelectorInput
          value={rule.right}
          state={state}
          disabled={disabled}
          fontData={fontData}
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
  fontData,
  onRuleChange,
}: {
  rule: Rule
  state: OpenTypeFeaturesState
  disabled?: boolean
  fontData: FontData | null
  onRuleChange: (next: Rule) => void
}) {
  const { t } = useTranslation()
  if (rule.kind === 'singleSubstitution') {
    return (
      <SingleSubstitutionCard
        rule={rule}
        state={state}
        disabled={disabled}
        fontData={fontData}
        onRuleChange={onRuleChange}
      />
    )
  }
  if (rule.kind === 'ligatureSubstitution') {
    return (
      <LigatureSubstitutionCard
        rule={rule}
        disabled={disabled}
        fontData={fontData}
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
        fontData={fontData}
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
  fontData,
  onStateChange,
}: {
  lookup: LookupRecord
  state: OpenTypeFeaturesState
  fontData: FontData | null
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
            <HStack key={rule.id} gap={1} align="flex-start">
              <Box flex={1} minW={0}>
                <RuleCard
                  rule={rule}
                  state={state}
                  disabled={disabled}
                  fontData={fontData}
                  onRuleChange={(next) =>
                    onStateChange(updateLookupRule(state, lookup.id, next))
                  }
                />
              </Box>
              {!disabled ? (
                <IconButton
                  size="2xs"
                  variant="ghost"
                  aria-label={t('projectControl.ruleDelete')}
                  onClick={() =>
                    onStateChange(deleteLookupRule(state, lookup.id, rule.id))
                  }
                >
                  ×
                </IconButton>
              ) : null}
            </HStack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

// The visual half of the per-feature editor: one card per lookup, one row per
// rule, editable for the rule kinds the visual editor understands so far
// (single/ligature substitution and pair positioning — contextual stays code).
const ADD_RULE_KINDS: Array<{ kind: CreatableRuleKind; labelKey: string }> = [
  { kind: 'singleSubstitution', labelKey: 'projectControl.addRuleSingleSub' },
  { kind: 'ligatureSubstitution', labelKey: 'projectControl.addRuleLigature' },
  { kind: 'pairPositioning', labelKey: 'projectControl.addRulePair' },
]

export function FeatureRuleEditor({
  state,
  lookupIds,
  fontData = null,
  feature,
  onStateChange,
}: FeatureRuleEditorProps) {
  const { t } = useTranslation()
  const lookups = lookupIds
    .map((lookupId) => state.lookups.find((lookup) => lookup.id === lookupId))
    .filter((lookup): lookup is LookupRecord => Boolean(lookup))

  const addRuleRow = feature ? (
    <HStack gap={1} wrap="wrap">
      {ADD_RULE_KINDS.map(({ kind, labelKey }) => (
        <Button
          key={kind}
          size="2xs"
          variant="outline"
          onClick={() =>
            onStateChange(addRuleToFeature(state, feature, kind).state)
          }
        >
          {t(labelKey)}
        </Button>
      ))}
    </HStack>
  ) : null

  if (lookups.length === 0) {
    return (
      <Stack gap={2}>
        <Text fontSize="sm" color="mutedForeground">
          {t('projectControl.noLookupsForFeature')}
        </Text>
        {addRuleRow}
      </Stack>
    )
  }

  return (
    <Stack gap={3}>
      {lookups.map((lookup) => (
        <LookupCard
          key={lookup.id}
          lookup={lookup}
          state={state}
          fontData={fontData}
          onStateChange={onStateChange}
        />
      ))}
      {addRuleRow}
    </Stack>
  )
}
