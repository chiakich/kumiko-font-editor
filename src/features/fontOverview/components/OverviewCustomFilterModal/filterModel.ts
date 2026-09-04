import type {
  OverviewCustomFilter,
  OverviewCustomFilterPreset,
  OverviewCustomFilterRule,
  OverviewCustomFilterRuleCondition,
  OverviewCustomFilterRuleField,
  OverviewCustomFilterRuleGroup,
  OverviewCustomFilterRuleOperator,
} from '@/lib/glyph/glyphOverview'
import { GLYPHS_LABEL_COLOR_KEYS } from '@/lib/color/kumikoColor'

export type OverviewCustomFilterDraft = Omit<
  OverviewCustomFilter,
  'id' | 'labelKey' | 'source'
>

export type RuleConditionUpdater = (
  ruleId: string,
  patch: Partial<OverviewCustomFilterRuleCondition>
) => void

export const TEXT_OPERATORS: OverviewCustomFilterRuleOperator[] = [
  'contains',
  'doesNotContain',
  'is',
  'isNot',
  'exists',
  'missing',
]

export const BOOLEAN_OPERATORS: OverviewCustomFilterRuleOperator[] = [
  'is',
  'isNot',
]

export const NUMBER_OPERATORS: OverviewCustomFilterRuleOperator[] = [
  'is',
  'isNot',
  'greaterThan',
  'lessThan',
  'atLeast',
  'atMost',
  'exists',
  'missing',
]

export const BOOLEAN_FIELDS = new Set<OverviewCustomFilterRuleField>([
  'export',
  'empty',
  'edited',
  'hasUnicode',
  'hasComponents',
  'hasAnchors',
  'hasHints',
  'hasCorners',
  'hasSpecialLayers',
  'hasCustomGlyphInfo',
  'isAutoAligned',
  'hasMetricsKeys',
  'hasColorLabel',
  'hasLayerColorLabel',
])

export const NUMBER_FIELDS = new Set<OverviewCustomFilterRuleField>([
  'pathCount',
  'componentCount',
])

export const COLOR_LABEL_FIELDS = new Set<OverviewCustomFilterRuleField>([
  'colorLabel',
  'layerColorLabel',
])

export const COLOR_LABEL_OPERATORS: OverviewCustomFilterRuleOperator[] = [
  'is',
  'isNot',
]

const COLOR_LABEL_VALUES = new Set<string>(['none', ...GLYPHS_LABEL_COLOR_KEYS])

export const RULE_FIELDS: OverviewCustomFilterRuleField[] = [
  'glyphName',
  'unicode',
  'note',
  'pathCount',
  'componentCount',
  'tags',
  'script',
  'category',
  'subCategory',
  'case',
  'component',
  'export',
  'empty',
  'edited',
  'hasUnicode',
  'hasComponents',
  'hasAnchors',
  'hasHints',
  'hasCorners',
  'hasSpecialLayers',
  'hasCustomGlyphInfo',
  'isAutoAligned',
  'hasMetricsKeys',
  'hasColorLabel',
  'colorLabel',
  'hasLayerColorLabel',
  'layerColorLabel',
]

export const createRuleId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const createDefaultRule = (): OverviewCustomFilterRuleCondition => ({
  field: 'glyphName',
  id: createRuleId(),
  operator: 'contains',
  value: '',
})

export const createDefaultRuleGroup = (): OverviewCustomFilterRuleGroup => ({
  id: createRuleId(),
  mode: 'all',
  rules: [createDefaultRule()],
  type: 'group',
})

export const createDefaultFilterDraft = (): OverviewCustomFilterDraft => ({
  mode: 'all',
  name: '',
  rules: [createDefaultRule()],
  sort: 'codePoint',
})

export const isBooleanField = (field: OverviewCustomFilterRuleField) =>
  BOOLEAN_FIELDS.has(field)

export const isNumberField = (field: OverviewCustomFilterRuleField) =>
  NUMBER_FIELDS.has(field)

export const isColorLabelField = (field: OverviewCustomFilterRuleField) =>
  COLOR_LABEL_FIELDS.has(field)

export const isRuleGroup = (
  rule: OverviewCustomFilterRule
): rule is OverviewCustomFilterRuleGroup => rule.type === 'group'

export const operatorNeedsValue = (
  operator: OverviewCustomFilterRuleOperator
) => operator !== 'exists' && operator !== 'missing'

export const getOperatorsForField = (field: OverviewCustomFilterRuleField) => {
  if (isColorLabelField(field)) {
    return COLOR_LABEL_OPERATORS
  }
  if (isBooleanField(field)) {
    return BOOLEAN_OPERATORS
  }
  if (isNumberField(field)) {
    return NUMBER_OPERATORS
  }
  return TEXT_OPERATORS
}

const normalizeColorLabelRuleValue = (value: string) => {
  const trimmedValue = value.trim()
  if (COLOR_LABEL_VALUES.has(trimmedValue)) {
    return trimmedValue
  }

  const index = Number(trimmedValue)
  if (Number.isInteger(index) && index >= 0) {
    return GLYPHS_LABEL_COLOR_KEYS[index] ?? 'none'
  }

  return 'none'
}

export const normalizeRuleForField = (
  rule: OverviewCustomFilterRuleCondition,
  field: OverviewCustomFilterRuleField
): OverviewCustomFilterRuleCondition => {
  const operators = getOperatorsForField(field)
  if (isColorLabelField(field)) {
    return {
      ...rule,
      field,
      operator: COLOR_LABEL_OPERATORS.includes(rule.operator)
        ? rule.operator
        : 'is',
      value: normalizeColorLabelRuleValue(rule.value),
    }
  }

  if (!operators.includes(rule.operator)) {
    return {
      ...rule,
      field,
      operator: operators[0] ?? 'contains',
      value: isBooleanField(field) ? 'true' : '',
    }
  }

  if (!isBooleanField(field)) {
    return { ...rule, field }
  }

  return {
    ...rule,
    field,
    operator: BOOLEAN_OPERATORS.includes(rule.operator) ? rule.operator : 'is',
    value: rule.value === 'false' ? 'false' : 'true',
  }
}

export const normalizeDraftRule = (
  rule: OverviewCustomFilterRule
): OverviewCustomFilterRule => {
  if (isRuleGroup(rule)) {
    return {
      ...rule,
      mode: rule.mode,
      rules: rule.rules.length
        ? rule.rules.map(normalizeDraftRule)
        : [createDefaultRule()],
      type: 'group',
    }
  }
  return normalizeRuleForField(rule, rule.field)
}

export const cloneDraftRule = (
  rule: OverviewCustomFilterRule
): OverviewCustomFilterRule => {
  if (isRuleGroup(rule)) {
    return {
      id: createRuleId(),
      mode: rule.mode,
      rules: rule.rules.map(cloneDraftRule),
      type: 'group',
    }
  }
  return {
    ...normalizeDraftRule(rule),
    id: createRuleId(),
  } as OverviewCustomFilterRuleCondition
}

export const createFilterDraft = (
  filter: OverviewCustomFilter | null,
  translatedFilterName?: string
): OverviewCustomFilterDraft =>
  filter
    ? {
        mode: filter.mode,
        name: translatedFilterName ?? filter.name,
        rules: filter.rules.length
          ? filter.rules.map(normalizeDraftRule)
          : [createDefaultRule()],
        sort: filter.sort ?? 'codePoint',
      }
    : createDefaultFilterDraft()

export const createFilterDraftFromPreset = (
  preset: OverviewCustomFilterPreset,
  translatedFilterName: string
): OverviewCustomFilterDraft => ({
  mode: preset.filter.mode,
  name: translatedFilterName,
  rules: preset.filter.rules.map(cloneDraftRule),
  sort: preset.filter.sort ?? 'codePoint',
})

export const hasValidRuleValue = (rule: OverviewCustomFilterRule): boolean => {
  if (isRuleGroup(rule)) {
    return rule.rules.length > 0 && rule.rules.every(hasValidRuleValue)
  }
  return !operatorNeedsValue(rule.operator) || rule.value.trim().length > 0
}

export const prepareRuleForSave = (
  rule: OverviewCustomFilterRule
): OverviewCustomFilterRule => {
  if (isRuleGroup(rule)) {
    return {
      id: rule.id,
      mode: rule.mode,
      rules: rule.rules.map(prepareRuleForSave),
      type: 'group',
    }
  }
  return {
    ...rule,
    value: operatorNeedsValue(rule.operator) ? rule.value.trim() : '',
  }
}

export const getRuleSummary = (
  rule: OverviewCustomFilterRule,
  t: (key: string) => string
): string => {
  if (isRuleGroup(rule)) {
    const mode = t(`fontOverview.customFilter.groupModes.${rule.mode}`)
    const rules = rule.rules.map((childRule) => getRuleSummary(childRule, t))
    return `${mode}(${rules.join(', ')})`
  }

  const field = t(`fontOverview.customFilter.fields.${rule.field}`)
  const operator = t(`fontOverview.customFilter.operators.${rule.operator}`)
  if (!operatorNeedsValue(rule.operator)) {
    return `${field} ${operator}`
  }
  return `${field} ${operator} ${rule.value}`
}

export const getPresetSummary = (
  preset: OverviewCustomFilterPreset,
  t: (key: string) => string
) => {
  const rules = preset.filter.rules.map((rule) => getRuleSummary(rule, t))
  const sort = t(
    preset.filter.sort === 'recentEdit'
      ? 'fontOverview.customFilter.sortRecentEdit'
      : 'fontOverview.customFilter.sortCodePoint'
  )
  return [...rules, sort].join(' / ')
}

export const updateRuleTree = (
  rules: OverviewCustomFilterRule[],
  ruleId: string,
  updater: (rule: OverviewCustomFilterRule) => OverviewCustomFilterRule
): OverviewCustomFilterRule[] =>
  rules.map((rule) => {
    if (rule.id === ruleId) {
      return updater(rule)
    }
    if (isRuleGroup(rule)) {
      return {
        ...rule,
        rules: updateRuleTree(rule.rules, ruleId, updater),
      }
    }
    return rule
  })

export const addRuleTreeChild = (
  rules: OverviewCustomFilterRule[],
  groupId: string | null,
  childRule: OverviewCustomFilterRule
): OverviewCustomFilterRule[] => {
  if (!groupId) {
    return [...rules, childRule]
  }

  return rules.map((rule) => {
    if (isRuleGroup(rule)) {
      if (rule.id === groupId) {
        return {
          ...rule,
          rules: [...rule.rules, childRule],
        }
      }
      return {
        ...rule,
        rules: addRuleTreeChild(rule.rules, groupId, childRule),
      }
    }
    return rule
  })
}

export const deleteRuleTreeNode = (
  rules: OverviewCustomFilterRule[],
  ruleId: string
): OverviewCustomFilterRule[] =>
  rules
    .filter((rule) => rule.id !== ruleId)
    .map((rule) =>
      isRuleGroup(rule)
        ? { ...rule, rules: deleteRuleTreeNode(rule.rules, ruleId) }
        : rule
    )
