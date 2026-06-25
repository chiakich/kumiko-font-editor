import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Stack,
  VStack,
  Field,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { Trash } from 'iconoir-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  OverviewCustomFilterMode,
  OverviewCustomFilterRule,
  OverviewCustomFilterRuleCondition,
  OverviewCustomFilterRuleField,
  OverviewCustomFilterRuleGroup,
  OverviewCustomFilterRuleOperator,
} from 'src/lib/glyph/glyphOverview'
import {
  GLYPHS_LABEL_COLOR_KEYS,
  GLYPHS_LABEL_COLORS,
  kumikoColorToCssRgba,
} from 'src/lib/color/kumikoColor'
import {
  getOperatorsForField,
  isBooleanField,
  isColorLabelField,
  isNumberField,
  isRuleGroup,
  operatorNeedsValue,
  RULE_FIELDS,
  type RuleConditionUpdater,
} from 'src/features/fontOverview/components/OverviewCustomFilterModal/filterModel'

interface RuleTreeEditorProps {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  canDeleteRule?: boolean
  deleteRule: (ruleId: string) => void
  rules: OverviewCustomFilterRule[]
  updateGroupMode: (groupId: string, mode: OverviewCustomFilterMode) => void
  updateRule: RuleConditionUpdater
}

export function RuleTreeEditor({
  addGroup,
  addRule,
  canDeleteRule = true,
  deleteRule,
  rules,
  updateGroupMode,
  updateRule,
}: RuleTreeEditorProps) {
  return (
    <VStack align="stretch" gap={2}>
      {rules.map((rule) =>
        isRuleGroup(rule) ? (
          <RuleGroupEditor
            key={rule.id}
            addGroup={addGroup}
            addRule={addRule}
            deleteRule={deleteRule}
            rule={rule}
            updateGroupMode={updateGroupMode}
            updateRule={updateRule}
          />
        ) : (
          <RuleConditionEditor
            key={rule.id}
            canDelete={canDeleteRule}
            deleteRule={deleteRule}
            rule={rule}
            updateRule={updateRule}
          />
        )
      )}
    </VStack>
  )
}

function RuleGroupEditor({
  addGroup,
  addRule,
  deleteRule,
  rule,
  updateGroupMode,
  updateRule,
}: {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  deleteRule: (ruleId: string) => void
  rule: OverviewCustomFilterRuleGroup
  updateGroupMode: (groupId: string, mode: OverviewCustomFilterMode) => void
  updateRule: RuleConditionUpdater
}) {
  return (
    <Box border="1px solid" borderColor="field.haze" borderRadius="2px" p={2}>
      <RuleGroupHeader
        addGroup={addGroup}
        addRule={addRule}
        deleteRule={deleteRule}
        rule={rule}
        updateGroupMode={updateGroupMode}
      />
      <RuleTreeEditor
        addGroup={addGroup}
        addRule={addRule}
        deleteRule={deleteRule}
        rules={rule.rules}
        updateGroupMode={updateGroupMode}
        updateRule={updateRule}
      />
    </Box>
  )
}

function RuleGroupHeader({
  addGroup,
  addRule,
  deleteRule,
  rule,
  updateGroupMode,
}: {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  deleteRule: (ruleId: string) => void
  rule: OverviewCustomFilterRuleGroup
  updateGroupMode: (groupId: string, mode: OverviewCustomFilterMode) => void
}) {
  const { t } = useTranslation()

  return (
    <Stack
      align={{ base: 'stretch', md: 'center' }}
      direction={{ base: 'column', md: 'row' }}
      mb={2}
      gap={2}
    >
      <Field.Root flex="1">
        <Field.Label fontSize="xs" mb={1}>
          {t('fontOverview.customFilter.groupMode')}
        </Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={rule.mode}
            onChange={(event) =>
              updateGroupMode(
                rule.id,
                event.target.value as OverviewCustomFilterMode
              )
            }
          >
            <option value="all">
              {t('fontOverview.customFilter.matchAll')}
            </option>
            <option value="any">
              {t('fontOverview.customFilter.matchAny')}
            </option>
            <option value="none">
              {t('fontOverview.customFilter.matchNone')}
            </option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
      <RuleGroupActions
        addGroup={addGroup}
        addRule={addRule}
        deleteRule={deleteRule}
        ruleId={rule.id}
      />
    </Stack>
  )
}

function RuleGroupActions({
  addGroup,
  addRule,
  deleteRule,
  ruleId,
}: {
  addGroup: (groupId: string | null) => void
  addRule: (groupId: string | null) => void
  deleteRule: (ruleId: string) => void
  ruleId: string
}) {
  const { t } = useTranslation()

  return (
    <HStack alignSelf={{ base: 'flex-end', md: 'flex-end' }} gap={2}>
      <Button size="sm" onClick={() => addRule(ruleId)}>
        {t('fontOverview.customFilter.addRule')}
      </Button>
      <Button size="sm" onClick={() => addGroup(ruleId)}>
        {t('fontOverview.customFilter.addGroup')}
      </Button>
      <Tooltip content={t('fontOverview.customFilter.deleteGroup')}>
        <IconButton
          aria-label={t('fontOverview.customFilter.deleteGroup')}
          size="sm"
          onClick={() => deleteRule(ruleId)}
        >
          <Trash width={17} height={17} strokeWidth={2.1} />
        </IconButton>
      </Tooltip>
    </HStack>
  )
}

function RuleConditionEditor({
  canDelete,
  deleteRule,
  rule,
  updateRule,
}: {
  canDelete: boolean
  deleteRule: (ruleId: string) => void
  rule: OverviewCustomFilterRuleCondition
  updateRule: RuleConditionUpdater
}) {
  const operators = getOperatorsForField(rule.field)
  const needsValue = operatorNeedsValue(rule.operator)
  const booleanField = isBooleanField(rule.field)
  const colorLabelField = isColorLabelField(rule.field)
  const numberField = isNumberField(rule.field)

  return (
    <Stack
      align={{ base: 'stretch', md: 'flex-start' }}
      direction={{ base: 'column', md: 'row' }}
      gap={2}
    >
      <RuleFieldSelect rule={rule} updateRule={updateRule} />
      <RuleOperatorSelect
        operators={operators}
        rule={rule}
        updateRule={updateRule}
      />
      <RuleValueControl
        booleanField={booleanField}
        colorLabelField={colorLabelField}
        needsValue={needsValue}
        numberField={numberField}
        rule={rule}
        updateRule={updateRule}
      />
      <RuleDeleteButton
        canDelete={canDelete}
        ruleId={rule.id}
        onDelete={deleteRule}
      />
    </Stack>
  )
}

function RuleFieldSelect({
  rule,
  updateRule,
}: {
  rule: OverviewCustomFilterRuleCondition
  updateRule: RuleConditionUpdater
}) {
  const { t } = useTranslation()

  return (
    <NativeSelect.Root>
      <NativeSelect.Field
        flex="1"
        value={rule.field}
        onChange={(event) =>
          updateRule(rule.id, {
            field: event.target.value as OverviewCustomFilterRuleField,
          })
        }
      >
        {RULE_FIELDS.map((field) => (
          <option key={field} value={field}>
            {t(`fontOverview.customFilter.fields.${field}`)}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  )
}

function RuleOperatorSelect({
  operators,
  rule,
  updateRule,
}: {
  operators: OverviewCustomFilterRuleOperator[]
  rule: OverviewCustomFilterRuleCondition
  updateRule: RuleConditionUpdater
}) {
  const { t } = useTranslation()

  return (
    <NativeSelect.Root>
      <NativeSelect.Field
        flex="1"
        value={rule.operator}
        onChange={(event) =>
          updateRule(rule.id, {
            operator: event.target.value as OverviewCustomFilterRuleOperator,
            value:
              event.target.value === 'missing' ||
              event.target.value === 'exists'
                ? ''
                : rule.value,
          })
        }
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {t(`fontOverview.customFilter.operators.${operator}`)}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  )
}

function RuleValueControl({
  booleanField,
  colorLabelField,
  needsValue,
  numberField,
  rule,
  updateRule,
}: {
  booleanField: boolean
  colorLabelField: boolean
  needsValue: boolean
  numberField: boolean
  rule: OverviewCustomFilterRuleCondition
  updateRule: RuleConditionUpdater
}) {
  const { t } = useTranslation()

  if (!needsValue) {
    return <Box flex="1" />
  }

  if (colorLabelField) {
    return <ColorLabelValueControl rule={rule} updateRule={updateRule} />
  }

  if (booleanField) {
    return (
      <NativeSelect.Root>
        <NativeSelect.Field
          flex="1"
          value={rule.value === 'false' ? 'false' : 'true'}
          onChange={(event) =>
            updateRule(rule.id, { value: event.target.value })
          }
        >
          <option value="true">
            {t('fontOverview.customFilter.booleanTrue')}
          </option>
          <option value="false">
            {t('fontOverview.customFilter.booleanFalse')}
          </option>
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    )
  }

  return (
    <Input
      flex="1"
      placeholder={t('fontOverview.customFilter.value')}
      type={numberField ? 'number' : 'text'}
      value={rule.value}
      onChange={(event) => updateRule(rule.id, { value: event.target.value })}
    />
  )
}

function ColorLabelValueControl({
  rule,
  updateRule,
}: {
  rule: OverviewCustomFilterRuleCondition
  updateRule: RuleConditionUpdater
}) {
  const { t } = useTranslation()
  const selectedValue = rule.value || 'none'

  return (
    <HStack align="center" flex="1" minH="40px" gap={1} wrap="wrap">
      <ColorLabelButton
        ariaLabel={t('glyphInspector.colorLabels.none')}
        isSelected={selectedValue === 'none'}
        onClick={() => updateRule(rule.id, { value: 'none' })}
      >
        <Box
          alignItems="center"
          border="1px solid"
          borderColor={
            selectedValue === 'none' ? 'field.ink' : 'field.gray.300'
          }
          borderRadius="full"
          display="flex"
          h={selectedValue === 'none' ? '18px' : '16px'}
          justifyContent="center"
          w={selectedValue === 'none' ? '18px' : '16px'}
        >
          <Box
            h="2px"
            w="10px"
            bg="field.gray.400"
            transform="rotate(-45deg)"
          />
        </Box>
      </ColorLabelButton>
      {GLYPHS_LABEL_COLORS.map((color, colorIndex) => {
        const colorKey = GLYPHS_LABEL_COLOR_KEYS[colorIndex]
        const isSelected = selectedValue === colorKey
        const label = t(`glyphInspector.colorLabels.${colorKey}`)
        return (
          <ColorLabelButton
            key={colorKey}
            ariaLabel={label}
            isSelected={isSelected}
            onClick={() => updateRule(rule.id, { value: colorKey })}
          >
            <Box
              bg={kumikoColorToCssRgba(color)}
              border={isSelected ? '1px solid' : 'none'}
              borderColor="field.ink"
              borderRadius="full"
              boxShadow={
                isSelected ? 'none' : 'inset 0 0 0 1px rgba(8, 11, 13, 0.18)'
              }
              h={isSelected ? '18px' : '16px'}
              opacity={isSelected ? 1 : 0.74}
              w={isSelected ? '18px' : '16px'}
            />
          </ColorLabelButton>
        )
      })}
    </HStack>
  )
}

function ColorLabelButton({
  ariaLabel,
  children,
  isSelected,
  onClick,
}: {
  ariaLabel: string
  children: ReactElement
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <Tooltip content={ariaLabel}>
      <IconButton
        aria-label={ariaLabel}
        aria-pressed={isSelected}
        bg="transparent"
        border="none"
        borderRadius="full"
        boxSize="22px"
        minW="22px"
        p={0}
        variant="ghost"
        _hover={{ bg: 'transparent' }}
        onClick={onClick}
      >
        {children}
      </IconButton>
    </Tooltip>
  )
}

function RuleDeleteButton({
  canDelete,
  onDelete,
  ruleId,
}: {
  canDelete: boolean
  onDelete: (ruleId: string) => void
  ruleId: string
}) {
  const { t } = useTranslation()

  return (
    <Tooltip content={t('fontOverview.customFilter.deleteRule')}>
      <IconButton
        alignSelf={{ base: 'flex-end', md: 'auto' }}
        aria-label={t('fontOverview.customFilter.deleteRule')}
        disabled={!canDelete}
        onClick={() => onDelete(ruleId)}
      >
        <Trash width={17} height={17} strokeWidth={2.1} />
      </IconButton>
    </Tooltip>
  )
}
