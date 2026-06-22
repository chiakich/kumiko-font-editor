import { isEmptyGlyphToEdit } from 'src/lib/glyph/glyphBlankness'
import { getGlyphComponentGlyphIds } from 'src/lib/glyph/glyphGeometryState'
import {
  getGlyphUnicodes,
  getPrimaryGlyphUnicode,
} from 'src/lib/glyph/glyphUnicode'
import {
  unicodeHexToCharacter,
  unicodeHexToCodePoint,
} from 'src/lib/project/unicode'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { activeLayer } from 'src/store/glyphLayer'
import type { GlyphData } from 'src/store/types'

export type OverviewGroupBy = 'none' | 'script' | 'block'
export type GlyphOverviewTreeKind = 'all' | 'category' | 'language' | 'filter'

export interface GlyphOverviewSection {
  id: string
  labelKey?: string
  label: string
  glyphs: GlyphData[]
  kind?: GlyphOverviewTreeKind
}

export interface GlyphOverviewTreeNode extends GlyphOverviewSection {
  children?: GlyphOverviewTreeNode[]
}

export type OverviewSearchField =
  | 'glyphName'
  | 'unicodeValue'
  | 'unicodeCharacter'
  | 'note'
  | 'component'
  | 'ids'

export interface OverviewSearchModel {
  fields?: OverviewSearchField[]
  matchCase?: boolean
  query: string
  regex?: boolean
}

export type OverviewCustomFilterMode = 'all' | 'any'
export type OverviewCustomFilterSource = 'seeded' | 'glyphs' | 'user'
export type OverviewCustomFilterSort = 'codePoint' | 'recentEdit'

export type OverviewCustomFilterRuleField =
  | 'glyphName'
  | 'unicode'
  | 'note'
  | 'category'
  | 'subCategory'
  | 'component'
  | 'export'
  | 'empty'
  | 'edited'
  | 'hasUnicode'
  | 'hasComponents'
  | 'hasAnchors'
  | 'hasHints'
  | 'hasMetricsKeys'
  | 'hasColorLabel'

export type OverviewCustomFilterRuleOperator =
  | 'contains'
  | 'doesNotContain'
  | 'is'
  | 'isNot'
  | 'exists'
  | 'missing'

export interface OverviewCustomFilterRule {
  field: OverviewCustomFilterRuleField
  id: string
  operator: OverviewCustomFilterRuleOperator
  value: string
}

export interface OverviewCustomFilter {
  id: string
  labelKey?: string
  mode: OverviewCustomFilterMode
  name: string
  rules: OverviewCustomFilterRule[]
  sort?: OverviewCustomFilterSort
  source?: OverviewCustomFilterSource
}

export const DEFAULT_OVERVIEW_SEARCH_FIELDS: OverviewSearchField[] = [
  'glyphName',
  'unicodeValue',
  'unicodeCharacter',
  'note',
  'component',
  'ids',
]

const SCRIPT_RANGES: Array<{ from: number; to: number; label: string }> = [
  { from: 0x0000, to: 0x024f, label: 'Latin' },
  { from: 0x0370, to: 0x03ff, label: 'Greek' },
  { from: 0x0400, to: 0x052f, label: 'Cyrillic' },
  { from: 0x0590, to: 0x05ff, label: 'Hebrew' },
  { from: 0x0600, to: 0x06ff, label: 'Arabic' },
  { from: 0x3040, to: 0x309f, label: 'Hiragana' },
  { from: 0x30a0, to: 0x30ff, label: 'Katakana' },
  { from: 0x3100, to: 0x312f, label: 'Bopomofo' },
  { from: 0x3130, to: 0x318f, label: 'Hangul Jamo' },
  { from: 0x31a0, to: 0x31bf, label: 'Bopomofo Extended' },
  { from: 0x3400, to: 0x4dbf, label: 'CJK Extension A' },
  { from: 0x4e00, to: 0x9fff, label: 'CJK Unified Ideographs' },
  { from: 0xac00, to: 0xd7af, label: 'Hangul Syllables' },
  { from: 0xf900, to: 0xfaff, label: 'CJK Compatibility Ideographs' },
  { from: 0xff00, to: 0xffef, label: 'Halfwidth and Fullwidth Forms' },
]

const BLOCK_RANGES: Array<{ from: number; to: number; label: string }> = [
  { from: 0x0000, to: 0x007f, label: 'Basic Latin' },
  { from: 0x0080, to: 0x00ff, label: 'Latin-1 Supplement' },
  { from: 0x0100, to: 0x017f, label: 'Latin Extended-A' },
  { from: 0x0180, to: 0x024f, label: 'Latin Extended-B' },
  { from: 0x0370, to: 0x03ff, label: 'Greek and Coptic' },
  { from: 0x0400, to: 0x04ff, label: 'Cyrillic' },
  { from: 0x2000, to: 0x206f, label: 'General Punctuation' },
  { from: 0x20a0, to: 0x20cf, label: 'Currency Symbols' },
  { from: 0x2100, to: 0x214f, label: 'Letterlike Symbols' },
  { from: 0x2190, to: 0x21ff, label: 'Arrows' },
  { from: 0x2200, to: 0x22ff, label: 'Mathematical Operators' },
  { from: 0x2460, to: 0x24ff, label: 'Enclosed Alphanumerics' },
  { from: 0x2500, to: 0x257f, label: 'Box Drawing' },
  { from: 0x2580, to: 0x259f, label: 'Block Elements' },
  { from: 0x25a0, to: 0x25ff, label: 'Geometric Shapes' },
  { from: 0x2600, to: 0x26ff, label: 'Miscellaneous Symbols' },
  { from: 0x27c0, to: 0x27ef, label: 'Miscellaneous Mathematical Symbols-A' },
  { from: 0x27f0, to: 0x27ff, label: 'Supplemental Arrows-A' },
  { from: 0x3000, to: 0x303f, label: 'CJK Symbols and Punctuation' },
  { from: 0x3040, to: 0x309f, label: 'Hiragana' },
  { from: 0x30a0, to: 0x30ff, label: 'Katakana' },
  { from: 0x3100, to: 0x312f, label: 'Bopomofo' },
  { from: 0x3130, to: 0x318f, label: 'Hangul Compatibility Jamo' },
  { from: 0x31a0, to: 0x31bf, label: 'Bopomofo Extended' },
  { from: 0x3400, to: 0x4dbf, label: 'CJK Unified Ideographs Extension A' },
  { from: 0x4e00, to: 0x9fff, label: 'CJK Unified Ideographs' },
  { from: 0xac00, to: 0xd7af, label: 'Hangul Syllables' },
  { from: 0xf900, to: 0xfaff, label: 'CJK Compatibility Ideographs' },
  { from: 0xff00, to: 0xffef, label: 'Halfwidth and Fullwidth Forms' },
]

interface GlyphCategoryDefinition {
  id: string
  label: string
  matches: (character: string | null) => boolean
}

const matchesUnicodeProperty = (character: string | null, pattern: RegExp) =>
  Boolean(character && pattern.test(character))

const GLYPH_CATEGORY_DEFINITIONS: GlyphCategoryDefinition[] = [
  {
    id: 'letter',
    label: 'Letter',
    matches: (character) => matchesUnicodeProperty(character, /\p{Letter}/u),
  },
  {
    id: 'number',
    label: 'Number',
    matches: (character) => matchesUnicodeProperty(character, /\p{Number}/u),
  },
  {
    id: 'separator',
    label: 'Separator',
    matches: (character) => matchesUnicodeProperty(character, /\p{Separator}/u),
  },
  {
    id: 'punctuation',
    label: 'Punctuation',
    matches: (character) =>
      matchesUnicodeProperty(character, /\p{Punctuation}/u),
  },
  {
    id: 'symbol',
    label: 'Symbol',
    matches: (character) => matchesUnicodeProperty(character, /\p{Symbol}/u),
  },
  {
    id: 'mark',
    label: 'Mark',
    matches: (character) => matchesUnicodeProperty(character, /\p{Mark}/u),
  },
]

const OTHER_CATEGORY = {
  id: 'other',
  label: 'Other',
}

const UNENCODED_CATEGORY = {
  id: 'unencoded',
  label: 'Unencoded',
}

const CUSTOM_FILTER_NODE_ID_PREFIX = 'custom-filter:'

const normalizeSearchText = (value: string, matchCase: boolean) =>
  matchCase ? value : value.toLocaleLowerCase()

const compact = <T>(values: Array<T | null | undefined | false>): T[] =>
  values.filter((value): value is T => Boolean(value))

const encodeFilterIdPart = (value: string) => encodeURIComponent(value)

export const isCustomOverviewFilterNodeId = (nodeId: string) =>
  nodeId.startsWith(CUSTOM_FILTER_NODE_ID_PREFIX)

export const customOverviewFilterIdToNodeId = (filterId: string) =>
  `${CUSTOM_FILTER_NODE_ID_PREFIX}${encodeFilterIdPart(filterId)}`

export const customOverviewFilterNodeIdToFilterId = (nodeId: string) =>
  isCustomOverviewFilterNodeId(nodeId)
    ? decodeURIComponent(nodeId.slice(CUSTOM_FILTER_NODE_ID_PREFIX.length))
    : null

const getCodePoint = (glyph: GlyphData) => {
  const primaryUnicode = getPrimaryGlyphUnicode(glyph)
  if (!primaryUnicode) {
    return null
  }

  return unicodeHexToCodePoint(primaryUnicode)
}

const getGlyphSortKey = (glyph: GlyphData) => {
  const codePoint = getCodePoint(glyph)
  return codePoint === null ? glyph.id : codePoint.toString().padStart(8, '0')
}

const sortGlyphsByCodePoint = (glyphs: GlyphData[]) =>
  [...glyphs].sort((left, right) => {
    const leftCodePoint = getCodePoint(left)
    const rightCodePoint = getCodePoint(right)
    if (leftCodePoint !== null && rightCodePoint !== null) {
      return leftCodePoint - rightCodePoint
    }
    return getGlyphSortKey(left).localeCompare(getGlyphSortKey(right))
  })

const sortGlyphsByRecentEdit = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes
) =>
  [...glyphs].sort(
    (left, right) =>
      (glyphEditTimes[right.id] ?? 0) - (glyphEditTimes[left.id] ?? 0) ||
      left.id.localeCompare(right.id)
  )

const findRangeLabel = (
  codePoint: number | null,
  ranges: Array<{ from: number; to: number; label: string }>
) => {
  if (codePoint === null) {
    return 'Unencoded'
  }

  return (
    ranges.find((range) => codePoint >= range.from && codePoint <= range.to)
      ?.label ?? 'Other'
  )
}

export const getGlyphScriptLabel = (glyph: GlyphData) =>
  findRangeLabel(getCodePoint(glyph), SCRIPT_RANGES)

export const getGlyphBlockLabel = (glyph: GlyphData) =>
  findRangeLabel(getCodePoint(glyph), BLOCK_RANGES)

export const getGlyphDisplayCharacter = (glyph: GlyphData) => {
  return unicodeHexToCharacter(getPrimaryGlyphUnicode(glyph))
}

const getInferredGlyphCategory = (glyph: GlyphData) => {
  const character = getGlyphDisplayCharacter(glyph)
  if (!character) {
    return getPrimaryGlyphUnicode(glyph) ? OTHER_CATEGORY : UNENCODED_CATEGORY
  }

  return (
    GLYPH_CATEGORY_DEFINITIONS.find((definition) =>
      definition.matches(character)
    ) ?? OTHER_CATEGORY
  )
}

const getGlyphCategoryPath = (glyph: GlyphData) => {
  const explicitCategory = glyph.category?.trim()
  const explicitSubCategory = glyph.subCategory?.trim()
  const fallbackCategory = getInferredGlyphCategory(glyph)

  return {
    category: explicitCategory || fallbackCategory.label,
    subCategory: explicitSubCategory || null,
  }
}

const createSectionNode = (
  id: string,
  label: string,
  glyphs: GlyphData[],
  kind: GlyphOverviewTreeKind,
  children?: GlyphOverviewTreeNode[],
  labelKey?: string
): GlyphOverviewTreeNode => ({
  id,
  label,
  ...(labelKey ? { labelKey } : {}),
  glyphs,
  kind,
  ...(children ? { children } : {}),
})

const uniqueGlyphs = (glyphs: GlyphData[]) => {
  const ids = new Set<string>()
  const unique: GlyphData[] = []

  for (const glyph of glyphs) {
    if (ids.has(glyph.id)) {
      continue
    }
    ids.add(glyph.id)
    unique.push(glyph)
  }

  return unique
}

const getOverviewSearchTargets = (
  glyph: GlyphData,
  fields: OverviewSearchField[],
  idsDictionary: Record<string, string[]>
) => {
  const fieldSet = new Set(fields)
  const unicodes = getGlyphUnicodes(glyph)

  return [
    ...(fieldSet.has('glyphName')
      ? compact([glyph.id, glyph.name, glyph.displayName, glyph.production])
      : []),
    ...(fieldSet.has('unicodeValue')
      ? unicodes.flatMap((unicode) => [unicode, `U+${unicode}`])
      : []),
    ...(fieldSet.has('unicodeCharacter')
      ? compact(unicodes.map((unicode) => unicodeHexToCharacter(unicode)))
      : []),
    ...(fieldSet.has('note') ? compact([glyph.note]) : []),
    ...(fieldSet.has('component') ? getGlyphComponentGlyphIds(glyph) : []),
    ...(fieldSet.has('ids') ? (idsDictionary[glyph.name] ?? []) : []),
  ]
}

export const createOverviewSearchMatcher = (
  model: OverviewSearchModel,
  idsDictionary: Record<string, string[]> = {}
) => {
  const query = model.query.trim()
  if (!query) {
    return () => true
  }

  const fields = model.fields?.length
    ? model.fields
    : DEFAULT_OVERVIEW_SEARCH_FIELDS
  const matchCase = Boolean(model.matchCase)

  if (model.regex) {
    try {
      const regex = new RegExp(query, matchCase ? 'u' : 'iu')
      return (glyph: GlyphData) =>
        getOverviewSearchTargets(glyph, fields, idsDictionary).some((target) =>
          regex.test(target)
        )
    } catch {
      return () => false
    }
  }

  const needle = normalizeSearchText(query, matchCase)
  return (glyph: GlyphData) =>
    getOverviewSearchTargets(glyph, fields, idsDictionary).some((target) =>
      normalizeSearchText(target, matchCase).includes(needle)
    )
}

export const filterGlyphsByOverviewSearch = (
  glyphs: GlyphData[],
  model: OverviewSearchModel,
  idsDictionary: Record<string, string[]> = {}
) => {
  const matcher = createOverviewSearchMatcher(model, idsDictionary)
  return glyphs.filter(matcher)
}

const CUSTOM_FILTER_FIELDS = new Set<OverviewCustomFilterRuleField>([
  'glyphName',
  'unicode',
  'note',
  'category',
  'subCategory',
  'component',
  'export',
  'empty',
  'edited',
  'hasUnicode',
  'hasComponents',
  'hasAnchors',
  'hasHints',
  'hasMetricsKeys',
  'hasColorLabel',
])

const CUSTOM_FILTER_OPERATORS = new Set<OverviewCustomFilterRuleOperator>([
  'contains',
  'doesNotContain',
  'is',
  'isNot',
  'exists',
  'missing',
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
): value is OverviewCustomFilterMode => value === 'all' || value === 'any'

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
            .map((rawRule) => {
              const rule = rawRule as Partial<OverviewCustomFilterRule>
              const ruleId = toCustomFilterString(rule.id)
              if (
                !ruleId ||
                !isCustomFilterField(rule.field) ||
                !isCustomFilterOperator(rule.operator)
              ) {
                return null
              }

              return {
                field: rule.field,
                id: ruleId,
                operator: rule.operator,
                value: toCustomFilterString(rule.value),
              }
            })
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

const buildCategoryNodes = (glyphs: GlyphData[]) => {
  const categoryMap = new Map<
    string,
    {
      glyphs: GlyphData[]
      subCategories: Map<string, GlyphData[]>
    }
  >()

  for (const glyph of glyphs) {
    const { category, subCategory } = getGlyphCategoryPath(glyph)
    const categoryRecord =
      categoryMap.get(category) ??
      (() => {
        const next = {
          glyphs: [],
          subCategories: new Map<string, GlyphData[]>(),
        }
        categoryMap.set(category, next)
        return next
      })()

    categoryRecord.glyphs.push(glyph)
    if (subCategory) {
      const subCategoryGlyphs = categoryRecord.subCategories.get(subCategory)
      if (subCategoryGlyphs) {
        subCategoryGlyphs.push(glyph)
      } else {
        categoryRecord.subCategories.set(subCategory, [glyph])
      }
    }
  }

  const preferredOrder = [
    ...GLYPH_CATEGORY_DEFINITIONS.map((definition) => definition.label),
    OTHER_CATEGORY.label,
    UNENCODED_CATEGORY.label,
  ]

  return [...categoryMap.entries()]
    .sort(([left], [right]) => {
      const leftIndex = preferredOrder.indexOf(left)
      const rightIndex = preferredOrder.indexOf(right)
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (
          (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) -
          (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER)
        )
      }
      return left.localeCompare(right)
    })
    .map(([category, record]) => {
      const categoryGlyphs = sortGlyphsByCodePoint(record.glyphs)
      const children = [...record.subCategories.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([subCategory, subCategoryGlyphs]) =>
          createSectionNode(
            `category:${encodeFilterIdPart(category)}/${encodeFilterIdPart(
              subCategory
            )}`,
            subCategory,
            sortGlyphsByCodePoint(subCategoryGlyphs),
            'category'
          )
        )

      return createSectionNode(
        `category:${encodeFilterIdPart(category)}`,
        category,
        categoryGlyphs,
        'category',
        children.length ? children : undefined
      )
    })
}

const buildLanguageNodes = (glyphs: GlyphData[]) => {
  const scriptMap = new Map<string, GlyphData[]>()
  for (const glyph of glyphs) {
    const label = getGlyphScriptLabel(glyph)
    const scriptGlyphs = scriptMap.get(label)
    if (scriptGlyphs) {
      scriptGlyphs.push(glyph)
    } else {
      scriptMap.set(label, [glyph])
    }
  }

  const labelsByOrder = [
    ...SCRIPT_RANGES.map((range) => range.label),
    'Other',
    'Unencoded',
  ]
  return labelsByOrder
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .map((label) => {
      const scriptGlyphs = sortGlyphsByCodePoint(scriptMap.get(label) ?? [])
      return createSectionNode(
        `script:${label}`,
        label,
        scriptGlyphs,
        'language'
      )
    })
    .filter((node) => node.glyphs.length > 0)
}

const hasMetricsKeys = (glyph: GlyphData) =>
  Boolean(
    glyph.leftMetricsKey || glyph.rightMetricsKey || glyph.widthMetricsKey
  )

const getLayer = (glyph: GlyphData) => activeLayer(glyph)

const booleanString = (value: boolean) => (value ? 'true' : 'false')

const createSeedRule = (
  field: OverviewCustomFilterRuleField,
  value = 'true'
): OverviewCustomFilterRule => ({
  field,
  id: `${field}-is-${value}`,
  operator: 'is',
  value,
})

const DEFAULT_OVERVIEW_CUSTOM_FILTERS: OverviewCustomFilter[] = [
  {
    id: 'seeded:recent-edits',
    labelKey: 'fontOverview.filterLabels.recentEdits',
    mode: 'all',
    name: 'Recently Edited',
    rules: [createSeedRule('edited')],
    sort: 'recentEdit',
    source: 'seeded',
  },
  {
    id: 'seeded:empty',
    labelKey: 'fontOverview.filterLabels.emptyGlyphs',
    mode: 'all',
    name: 'Empty Glyphs',
    rules: [createSeedRule('empty')],
    sort: 'codePoint',
    source: 'seeded',
  },
  {
    id: 'seeded:has-color-label',
    labelKey: 'fontOverview.filterLabels.hasColorLabel',
    mode: 'all',
    name: 'Has Color Label',
    rules: [createSeedRule('hasColorLabel')],
    sort: 'codePoint',
    source: 'seeded',
  },
]

export const createDefaultOverviewCustomFilters = () =>
  DEFAULT_OVERVIEW_CUSTOM_FILTERS.map((filter) => ({
    ...filter,
    rules: filter.rules.map((rule) => ({ ...rule })),
  }))

const buildFilterNodes = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes,
  customFilters: OverviewCustomFilter[]
) => {
  return customFilters.map((filter) => {
    const filterGlyphs = glyphs.filter((glyph) =>
      matchesOverviewCustomFilter(glyph, filter, glyphEditTimes)
    )
    const sortedGlyphs =
      filter.sort === 'recentEdit'
        ? sortGlyphsByRecentEdit(filterGlyphs, glyphEditTimes)
        : sortGlyphsByCodePoint(filterGlyphs)

    return createSectionNode(
      customOverviewFilterIdToNodeId(filter.id),
      filter.name,
      sortedGlyphs,
      'filter',
      undefined,
      filter.labelKey
    )
  })
}

const getOverviewCustomFilterRuleValues = (
  glyph: GlyphData,
  field: OverviewCustomFilterRuleField,
  glyphEditTimes: GlyphEditTimes
) => {
  const { category, subCategory } = getGlyphCategoryPath(glyph)

  switch (field) {
    case 'glyphName':
      return compact([
        glyph.id,
        glyph.name,
        glyph.displayName,
        glyph.production,
      ])
    case 'unicode':
      return getGlyphUnicodes(glyph).flatMap((unicode) =>
        compact([unicode, `U+${unicode}`, unicodeHexToCharacter(unicode)])
      )
    case 'note':
      return compact([glyph.note])
    case 'category':
      return [category]
    case 'subCategory':
      return compact([subCategory])
    case 'component':
      return getGlyphComponentGlyphIds(glyph)
    case 'export':
      return [booleanString(glyph.export !== false)]
    case 'empty':
      return [booleanString(isEmptyGlyphToEdit(glyph))]
    case 'edited':
      return [booleanString(Number.isFinite(glyphEditTimes[glyph.id]))]
    case 'hasUnicode':
      return [booleanString(getGlyphUnicodes(glyph).length > 0)]
    case 'hasComponents':
      return [booleanString(getGlyphComponentGlyphIds(glyph).length > 0)]
    case 'hasAnchors':
      return [booleanString(getLayer(glyph).anchors.length > 0)]
    case 'hasHints':
      return [booleanString((getLayer(glyph).hints ?? []).length > 0)]
    case 'hasMetricsKeys':
      return [booleanString(hasMetricsKeys(glyph))]
    case 'hasColorLabel':
      return [booleanString(Boolean(glyph.color))]
  }
}

const matchesOverviewCustomFilterRule = (
  glyph: GlyphData,
  rule: OverviewCustomFilterRule,
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

  return filter.mode === 'any'
    ? rules.some((rule) =>
        matchesOverviewCustomFilterRule(glyph, rule, glyphEditTimes)
      )
    : rules.every((rule) =>
        matchesOverviewCustomFilterRule(glyph, rule, glyphEditTimes)
      )
}

export const getGlyphOverviewTree = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes,
  customFilters: OverviewCustomFilter[] = createDefaultOverviewCustomFilters()
): GlyphOverviewTreeNode[] => {
  const sortedGlyphs = sortGlyphsByCodePoint(glyphs)
  const categoryNodes = buildCategoryNodes(glyphs)
  const languageNodes = buildLanguageNodes(glyphs)
  const filterNodes = buildFilterNodes(
    glyphs,
    glyphEditTimes,
    normalizeOverviewCustomFilters(customFilters)
  )

  return [
    createSectionNode('all', 'All', sortedGlyphs, 'all'),
    createSectionNode(
      'filters',
      'Filters',
      uniqueGlyphs(filterNodes.flatMap((node) => node.glyphs)),
      'filter',
      filterNodes
    ),
    createSectionNode(
      'categories',
      'Categories',
      sortedGlyphs,
      'category',
      categoryNodes
    ),
    createSectionNode(
      'languages',
      'Languages',
      sortedGlyphs,
      'language',
      languageNodes
    ),
  ]
}

export const flattenGlyphOverviewTree = (
  nodes: GlyphOverviewTreeNode[]
): GlyphOverviewSection[] =>
  nodes.flatMap((node) => [
    {
      id: node.id,
      labelKey: node.labelKey,
      label: node.label,
      glyphs: node.glyphs,
      kind: node.kind,
    },
    ...flattenGlyphOverviewTree(node.children ?? []),
  ])

export const getGlyphOverviewSections = (
  glyphs: GlyphData[],
  groupBy: OverviewGroupBy
): GlyphOverviewSection[] => {
  if (groupBy === 'none') {
    return [
      {
        id: 'all',
        label: 'All',
        glyphs: [...glyphs].sort((left, right) =>
          left.id.localeCompare(right.id)
        ),
        kind: 'all',
      },
    ]
  }

  const sectionMap = new Map<string, GlyphData[]>()

  for (const glyph of glyphs) {
    const key =
      groupBy === 'script'
        ? getGlyphScriptLabel(glyph)
        : getGlyphBlockLabel(glyph)
    const items = sectionMap.get(key) ?? []
    items.push(glyph)
    sectionMap.set(key, items)
  }

  return [...sectionMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, sectionGlyphs]) => ({
      id: label,
      label,
      glyphs: [...sectionGlyphs].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
      kind: groupBy === 'script' ? 'language' : 'category',
    }))
}

export const getGlyphOverviewStats = (glyph: GlyphData) => {
  const layer = activeLayer(glyph)
  return {
    contourCount: layer.paths.length,
    componentCount: layer.componentRefs.length,
    anchorCount: layer.anchors?.length ?? 0,
    guidelineCount: layer.guidelines?.length ?? 0,
  }
}
