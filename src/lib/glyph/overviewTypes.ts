import type { GlyphData } from '@/domain'

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

export type OverviewCustomFilterMode = 'all' | 'any' | 'none'
export type OverviewCustomFilterSource = 'seeded' | 'glyphs' | 'user'
export type OverviewCustomFilterSort = 'codePoint' | 'recentEdit'

export type OverviewCustomFilterRuleField =
  | 'glyphName'
  | 'unicode'
  | 'note'
  | 'pathCount'
  | 'componentCount'
  | 'tags'
  | 'script'
  | 'category'
  | 'subCategory'
  | 'case'
  | 'component'
  | 'export'
  | 'empty'
  | 'edited'
  | 'hasUnicode'
  | 'hasComponents'
  | 'hasAnchors'
  | 'hasHints'
  | 'hasCorners'
  | 'hasSpecialLayers'
  | 'hasCustomGlyphInfo'
  | 'isAutoAligned'
  | 'hasMetricsKeys'
  | 'hasColorLabel'
  | 'colorLabel'
  | 'hasLayerColorLabel'
  | 'layerColorLabel'

export type OverviewCustomFilterRuleOperator =
  | 'contains'
  | 'doesNotContain'
  | 'is'
  | 'isNot'
  | 'exists'
  | 'missing'
  | 'greaterThan'
  | 'lessThan'
  | 'atLeast'
  | 'atMost'

export interface OverviewCustomFilterRuleCondition {
  type?: 'condition'
  field: OverviewCustomFilterRuleField
  id: string
  operator: OverviewCustomFilterRuleOperator
  value: string
}

export interface OverviewCustomFilterRuleGroup {
  id: string
  mode: OverviewCustomFilterMode
  rules: OverviewCustomFilterRule[]
  type: 'group'
}

export type OverviewCustomFilterRule =
  | OverviewCustomFilterRuleCondition
  | OverviewCustomFilterRuleGroup

export interface OverviewCustomFilter {
  id: string
  labelKey?: string
  mode: OverviewCustomFilterMode
  name: string
  rules: OverviewCustomFilterRule[]
  sort?: OverviewCustomFilterSort
  source?: OverviewCustomFilterSource
}

export interface OverviewCustomFilterPreset {
  filter: Omit<OverviewCustomFilter, 'id' | 'source'>
  id: string
  labelKey: string
}

export const DEFAULT_OVERVIEW_SEARCH_FIELDS: OverviewSearchField[] = [
  'glyphName',
  'unicodeValue',
  'unicodeCharacter',
  'note',
  'component',
  'ids',
]
