import type { GlyphEditTimes } from '@/lib/glyph/glyphEditTimes'
import { getOverviewCustomFilterRuleValues } from '@/lib/glyph/overviewCustomFilterValues'
import { normalizeSearchText } from '@/lib/glyph/overviewSearch'
import type {
  OverviewCustomFilter,
  OverviewCustomFilterPreset,
  OverviewCustomFilterRule,
  OverviewCustomFilterRuleCondition,
  OverviewCustomFilterRuleField,
  OverviewCustomFilterRuleGroup,
  OverviewCustomFilterSort,
} from '@/lib/glyph/overviewTypes'
import type { GlyphData } from '@/domain'

const CUSTOM_FILTER_NODE_ID_PREFIX = 'custom-filter:'

export const encodeFilterIdPart = (value: string) => encodeURIComponent(value)

export const isCustomOverviewFilterNodeId = (nodeId: string) =>
  nodeId.startsWith(CUSTOM_FILTER_NODE_ID_PREFIX)

export const customOverviewFilterIdToNodeId = (filterId: string) =>
  `${CUSTOM_FILTER_NODE_ID_PREFIX}${encodeFilterIdPart(filterId)}`

export const customOverviewFilterNodeIdToFilterId = (nodeId: string) =>
  isCustomOverviewFilterNodeId(nodeId)
    ? decodeURIComponent(nodeId.slice(CUSTOM_FILTER_NODE_ID_PREFIX.length))
    : null

const createSeedRule = (
  field: OverviewCustomFilterRuleField,
  value = 'true'
): OverviewCustomFilterRule => ({
  field,
  id: `${field}-is-${value}`,
  operator: 'is',
  value,
})

const createPresetFilter = (
  id: string,
  labelKey: string,
  name: string,
  rules: OverviewCustomFilterRule[],
  sort: OverviewCustomFilterSort = 'codePoint'
): OverviewCustomFilterPreset => ({
  filter: {
    labelKey,
    mode: 'all',
    name,
    rules,
    sort,
  },
  id,
  labelKey,
})

const OVERVIEW_CUSTOM_FILTER_PRESETS: OverviewCustomFilterPreset[] = [
  createPresetFilter(
    'recent-edits',
    'fontOverview.filterLabels.recentEdits',
    'Recently Edited',
    [createSeedRule('edited')],
    'recentEdit'
  ),
  createPresetFilter(
    'empty',
    'fontOverview.filterLabels.emptyGlyphs',
    'Empty Glyphs',
    [createSeedRule('empty')]
  ),
  createPresetFilter(
    'has-color-label',
    'fontOverview.filterLabels.hasColorLabel',
    'Has Color Label',
    [createSeedRule('hasColorLabel')]
  ),
  createPresetFilter(
    'exporting',
    'fontOverview.filterLabels.exporting',
    'Exporting',
    [createSeedRule('export')]
  ),
  createPresetFilter(
    'not-exporting',
    'fontOverview.filterLabels.notExporting',
    'Not Exporting',
    [createSeedRule('export', 'false')]
  ),
  createPresetFilter(
    'has-unicode',
    'fontOverview.filterLabels.hasUnicode',
    'Has Unicode',
    [createSeedRule('hasUnicode')]
  ),
  createPresetFilter(
    'no-unicode',
    'fontOverview.filterLabels.noUnicode',
    'No Unicode',
    [createSeedRule('hasUnicode', 'false')]
  ),
  createPresetFilter(
    'has-components',
    'fontOverview.filterLabels.hasComponents',
    'Has Components',
    [createSeedRule('hasComponents')]
  ),
  createPresetFilter(
    'has-anchors',
    'fontOverview.filterLabels.hasAnchors',
    'Has Anchors',
    [createSeedRule('hasAnchors')]
  ),
  createPresetFilter(
    'has-hints',
    'fontOverview.filterLabels.hasHints',
    'Has Hints',
    [createSeedRule('hasHints')]
  ),
  createPresetFilter(
    'has-metrics-keys',
    'fontOverview.filterLabels.hasMetricsKeys',
    'Has Metrics Keys',
    [createSeedRule('hasMetricsKeys')]
  ),
]

const DEFAULT_OVERVIEW_CUSTOM_FILTER_PRESET_IDS = new Set([
  'recent-edits',
  'empty',
  'has-color-label',
])

const clonePresetFilter = (
  filter: OverviewCustomFilterPreset['filter']
): OverviewCustomFilterPreset['filter'] => ({
  ...filter,
  rules: filter.rules.map((rule) => ({ ...rule })),
})

export const createOverviewCustomFilterPresets = () =>
  OVERVIEW_CUSTOM_FILTER_PRESETS.map((preset) => ({
    ...preset,
    filter: clonePresetFilter(preset.filter),
  }))

export const createDefaultOverviewCustomFilters = () =>
  createOverviewCustomFilterPresets()
    .filter((preset) =>
      DEFAULT_OVERVIEW_CUSTOM_FILTER_PRESET_IDS.has(preset.id)
    )
    .map((preset) => ({
      ...clonePresetFilter(preset.filter),
      id: `seeded:${preset.id}`,
      source: 'seeded' as const,
    }))

const CUSTOM_FILTER_NUMERIC_FIELDS = new Set<OverviewCustomFilterRuleField>([
  'pathCount',
  'componentCount',
])

const parseComparableNumber = (value: string) => {
  const number = Number(value.trim())
  return Number.isFinite(number) ? number : null
}

const matchesOverviewCustomFilterRule = (
  glyph: GlyphData,
  rule: OverviewCustomFilterRuleCondition,
  glyphEditTimes: GlyphEditTimes
) => {
  const values = getOverviewCustomFilterRuleValues(
    glyph,
    rule.field,
    glyphEditTimes
  )
  const normalizedValues = values.map((value) =>
    normalizeSearchText(value, false)
  )
  const normalizedValue = normalizeSearchText(rule.value, false)
  const hasValue = values.some((value) => value.trim().length > 0)
  const hasComparableValue = normalizedValue.trim().length > 0

  if (CUSTOM_FILTER_NUMERIC_FIELDS.has(rule.field)) {
    const comparableValue = parseComparableNumber(rule.value)
    const comparableValues = values.flatMap((value) => {
      const number = parseComparableNumber(value)
      return number === null ? [] : [number]
    })
    const hasComparableNumbers = comparableValues.length > 0

    switch (rule.operator) {
      case 'exists':
        return hasComparableNumbers
      case 'missing':
        return !hasComparableNumbers
      case 'is':
        return (
          comparableValue !== null &&
          comparableValues.some((value) => value === comparableValue)
        )
      case 'isNot':
        return (
          comparableValue !== null &&
          comparableValues.every((value) => value !== comparableValue)
        )
      case 'greaterThan':
        return (
          comparableValue !== null &&
          comparableValues.some((value) => value > comparableValue)
        )
      case 'lessThan':
        return (
          comparableValue !== null &&
          comparableValues.some((value) => value < comparableValue)
        )
      case 'atLeast':
        return (
          comparableValue !== null &&
          comparableValues.some((value) => value >= comparableValue)
        )
      case 'atMost':
        return (
          comparableValue !== null &&
          comparableValues.some((value) => value <= comparableValue)
        )
      case 'contains':
      case 'doesNotContain':
        return false
    }
  }

  switch (rule.operator) {
    case 'exists':
      return hasValue
    case 'missing':
      return !hasValue
    case 'contains':
      return (
        hasComparableValue &&
        normalizedValues.some((value) => value.includes(normalizedValue))
      )
    case 'doesNotContain':
      return (
        hasComparableValue &&
        normalizedValues.every((value) => !value.includes(normalizedValue))
      )
    case 'is':
      return (
        hasComparableValue &&
        normalizedValues.some((value) => value === normalizedValue)
      )
    case 'isNot':
      return (
        hasComparableValue &&
        normalizedValues.every((value) => value !== normalizedValue)
      )
    case 'greaterThan':
    case 'lessThan':
    case 'atLeast':
    case 'atMost':
      return false
  }
}

const isCustomFilterRuleGroup = (
  rule: OverviewCustomFilterRule
): rule is OverviewCustomFilterRuleGroup => rule.type === 'group'

const matchesOverviewCustomFilterRuleNode = (
  glyph: GlyphData,
  rule: OverviewCustomFilterRule,
  glyphEditTimes: GlyphEditTimes
): boolean => {
  if (!isCustomFilterRuleGroup(rule)) {
    return matchesOverviewCustomFilterRule(glyph, rule, glyphEditTimes)
  }

  if (!rule.rules.length) {
    return false
  }

  switch (rule.mode) {
    case 'any':
      return rule.rules.some((childRule) =>
        matchesOverviewCustomFilterRuleNode(glyph, childRule, glyphEditTimes)
      )
    case 'none':
      return rule.rules.every(
        (childRule) =>
          !matchesOverviewCustomFilterRuleNode(glyph, childRule, glyphEditTimes)
      )
    case 'all':
      return rule.rules.every((childRule) =>
        matchesOverviewCustomFilterRuleNode(glyph, childRule, glyphEditTimes)
      )
  }
}

export const matchesOverviewCustomFilter = (
  glyph: GlyphData,
  filter: OverviewCustomFilter,
  glyphEditTimes: GlyphEditTimes = {}
) => {
  const rules = filter.rules
  if (!rules.length) {
    return false
  }

  switch (filter.mode) {
    case 'any':
      return rules.some((rule) =>
        matchesOverviewCustomFilterRuleNode(glyph, rule, glyphEditTimes)
      )
    case 'none':
      return rules.every(
        (rule) =>
          !matchesOverviewCustomFilterRuleNode(glyph, rule, glyphEditTimes)
      )
    case 'all':
      return rules.every((rule) =>
        matchesOverviewCustomFilterRuleNode(glyph, rule, glyphEditTimes)
      )
  }
}
