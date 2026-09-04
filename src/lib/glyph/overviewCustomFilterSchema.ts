import type {
  OverviewCustomFilter,
  OverviewCustomFilterMode,
  OverviewCustomFilterRule,
  OverviewCustomFilterRuleCondition,
  OverviewCustomFilterRuleField,
  OverviewCustomFilterRuleGroup,
  OverviewCustomFilterRuleOperator,
  OverviewCustomFilterSort,
  OverviewCustomFilterSource,
} from '@/lib/glyph/overviewTypes'

const CUSTOM_FILTER_FIELDS = new Set<OverviewCustomFilterRuleField>([
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
])

const CUSTOM_FILTER_OPERATORS = new Set<OverviewCustomFilterRuleOperator>([
  'contains',
  'doesNotContain',
  'is',
  'isNot',
  'exists',
  'missing',
  'greaterThan',
  'lessThan',
  'atLeast',
  'atMost',
])

const CUSTOM_FILTER_SOURCES = new Set<OverviewCustomFilterSource>([
  'seeded',
  'glyphs',
  'user',
])

const CUSTOM_FILTER_SORTS = new Set<OverviewCustomFilterSort>([
  'codePoint',
  'recentEdit',
])

const toCustomFilterString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

const isCustomFilterMode = (
  value: unknown
): value is OverviewCustomFilterMode =>
  value === 'all' || value === 'any' || value === 'none'

const isCustomFilterField = (
  value: unknown
): value is OverviewCustomFilterRuleField =>
  typeof value === 'string' &&
  CUSTOM_FILTER_FIELDS.has(value as OverviewCustomFilterRuleField)

const isCustomFilterOperator = (
  value: unknown
): value is OverviewCustomFilterRuleOperator =>
  typeof value === 'string' &&
  CUSTOM_FILTER_OPERATORS.has(value as OverviewCustomFilterRuleOperator)

const isCustomFilterSource = (
  value: unknown
): value is OverviewCustomFilterSource =>
  typeof value === 'string' &&
  CUSTOM_FILTER_SOURCES.has(value as OverviewCustomFilterSource)

const isCustomFilterSort = (
  value: unknown
): value is OverviewCustomFilterSort =>
  typeof value === 'string' &&
  CUSTOM_FILTER_SORTS.has(value as OverviewCustomFilterSort)

const normalizeOverviewCustomFilterRule = (
  rawRule: unknown
): OverviewCustomFilterRule | null => {
  const rule = rawRule as Partial<OverviewCustomFilterRule>
  const ruleId = toCustomFilterString(rule.id)
  if (!ruleId) {
    return null
  }

  if (rule.type === 'group') {
    const rawGroup = rawRule as Partial<OverviewCustomFilterRuleGroup>
    const rules = Array.isArray(rawGroup.rules)
      ? rawGroup.rules
          .map(normalizeOverviewCustomFilterRule)
          .filter((childRule): childRule is OverviewCustomFilterRule =>
            Boolean(childRule)
          )
      : []

    return {
      id: ruleId,
      mode: isCustomFilterMode(rawGroup.mode) ? rawGroup.mode : 'all',
      rules,
      type: 'group',
    }
  }

  const rawCondition = rawRule as Partial<OverviewCustomFilterRuleCondition>
  if (
    !isCustomFilterField(rawCondition.field) ||
    !isCustomFilterOperator(rawCondition.operator)
  ) {
    return null
  }

  return {
    ...(rawCondition.type === 'condition'
      ? { type: 'condition' as const }
      : {}),
    field: rawCondition.field,
    id: ruleId,
    operator: rawCondition.operator,
    value: toCustomFilterString(rawCondition.value),
  }
}

export const normalizeOverviewCustomFilters = (
  filters: unknown
): OverviewCustomFilter[] => {
  if (!Array.isArray(filters)) {
    return []
  }

  return filters
    .map((rawFilter): OverviewCustomFilter | null => {
      const record = rawFilter as Partial<OverviewCustomFilter>
      const id = toCustomFilterString(record.id)
      const name = toCustomFilterString(record.name)
      if (!id || !name) {
        return null
      }

      const rules = Array.isArray(record.rules)
        ? record.rules
            .map(normalizeOverviewCustomFilterRule)
            .filter((rule): rule is OverviewCustomFilterRule => Boolean(rule))
        : []

      const labelKey = toCustomFilterString(record.labelKey)
      return {
        id,
        ...(labelKey ? { labelKey } : {}),
        mode: isCustomFilterMode(record.mode) ? record.mode : 'all',
        name,
        rules,
        sort: isCustomFilterSort(record.sort) ? record.sort : 'codePoint',
        source: isCustomFilterSource(record.source) ? record.source : 'user',
      }
    })
    .filter((filter): filter is OverviewCustomFilter => Boolean(filter))
}
