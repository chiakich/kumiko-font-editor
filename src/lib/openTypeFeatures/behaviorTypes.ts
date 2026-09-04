import type { PairPositioningRule, Rule } from '@/lib/openTypeFeatures/types'

export type CombinationBehaviorType =
  | 'standardLigature'
  | 'decorativeLigature'
  | 'requiredLigature'
  | 'fraction'
  | 'numerator'
  | 'denominator'
  | 'customFeature'

export interface CombinationBehaviorRow {
  id: string
  lookupId: string
  ruleId: string
  input: string
  output: string
  type: CombinationBehaviorType
  featureTag: string
  origin: Rule['meta']['origin']
  sourceLabel: string
  status: CombinationBehaviorStatus[]
}

export type CombinationBehaviorStatus =
  | 'Duplicate'
  | 'Conflict'
  | 'Missing Glyph'
  | 'Invalid Input'

export interface CombinationBehaviorDraft {
  lookupId?: string
  ruleId?: string
  input: string
  output: string
  type: CombinationBehaviorType
  customFeatureTag?: string
}

export type AlternateBehaviorType =
  | 'stylisticAlternate'
  | 'swash'
  | 'stylisticSet01'
  | 'stylisticSet02'
  | 'stylisticSet03'
  | 'stylisticSet04'
  | 'stylisticSet05'
  | 'customFeature'

export interface AlternateBehaviorRow {
  id: string
  lookupId: string
  ruleId: string
  source: string
  alternate: string
  type: AlternateBehaviorType
  featureTag: string
  origin: Rule['meta']['origin']
  sourceLabel: string
  status: AlternateBehaviorStatus[]
}

export type AlternateBehaviorStatus =
  | 'Duplicate'
  | 'Conflict'
  | 'Missing Glyph'
  | 'Invalid Input'

export interface AlternateBehaviorDraft {
  lookupId?: string
  ruleId?: string
  source: string
  alternate: string
  type: AlternateBehaviorType
  customFeatureTag?: string
}

export interface SpacingBehaviorRow {
  id: string
  lookupId: string
  ruleId: string
  left: string
  right: string
  leftSelector?: PairPositioningRule['left']
  rightSelector?: PairPositioningRule['right']
  leftLabel?: string
  rightLabel?: string
  leftClass?: SpacingBehaviorClassSummary
  rightClass?: SpacingBehaviorClassSummary
  value: number
  featureTag: 'kern'
  origin: Rule['meta']['origin']
  sourceLabel: string
  scope?: 'glyphPair' | 'classPair'
  status: SpacingBehaviorStatus[]
}

export interface SpacingBehaviorClassSummary {
  id: string
  name: string
  glyphs: string[]
}

export type SpacingBehaviorStatus =
  | 'Duplicate'
  | 'Conflict'
  | 'Missing Glyph'
  | 'Invalid Input'

export interface SpacingBehaviorDraft {
  lookupId?: string
  ruleId?: string
  left: string
  right: string
  leftSelector?: PairPositioningRule['left']
  rightSelector?: PairPositioningRule['right']
  value: number
}

export interface ContextualBehaviorRow {
  id: string
  lookupId: string
  ruleId: string
  source: string
  replacement: string
  before: string
  after: string
  featureTag: 'calt'
  origin: Rule['meta']['origin']
  sourceLabel: string
  status: ContextualBehaviorStatus[]
}

export type ContextualBehaviorStatus =
  | 'Duplicate'
  | 'Missing Glyph'
  | 'Invalid Input'

export interface ContextualBehaviorDraft {
  lookupId?: string
  ruleId?: string
  source: string
  replacement: string
  before: string
  after: string
}

export interface AnchorBehaviorRow {
  id: string
  glyphId: string
  name: string
  x: number
  y: number
  kind: 'base' | 'mark'
  status: AnchorBehaviorStatus[]
}

export type AnchorBehaviorStatus = 'Duplicate' | 'Invalid Input'

export interface AnchorBehaviorDraft {
  id?: string
  glyphId: string
  name: string
  x: number
  y: number
}

export interface BehaviorRuleReferenceTarget {
  lookupId?: string
  ruleId?: string
  alternate?: string
}

export const BEHAVIOR_TYPE_TO_FEATURE_TAG: Record<
  Exclude<CombinationBehaviorType, 'customFeature'>,
  string
> = {
  standardLigature: 'liga',
  decorativeLigature: 'dlig',
  requiredLigature: 'rlig',
  fraction: 'frac',
  numerator: 'numr',
  denominator: 'dnom',
}

export const FEATURE_TAG_TO_BEHAVIOR_TYPE: Record<
  string,
  CombinationBehaviorType
> = {
  liga: 'standardLigature',
  dlig: 'decorativeLigature',
  rlig: 'requiredLigature',
  frac: 'fraction',
  numr: 'numerator',
  dnom: 'denominator',
}

export const COMBINATION_BEHAVIOR_TYPE_LABELS: Record<
  CombinationBehaviorType,
  string
> = {
  standardLigature: 'Standard Ligature',
  decorativeLigature: 'Decorative Ligature',
  requiredLigature: 'Required Ligature',
  fraction: 'Fraction',
  numerator: 'Numerator',
  denominator: 'Denominator',
  customFeature: 'Custom Feature',
}

export const COMBINATION_BEHAVIOR_TYPES: CombinationBehaviorType[] = [
  'standardLigature',
  'decorativeLigature',
  'requiredLigature',
  'fraction',
  'numerator',
  'denominator',
  'customFeature',
]

export const ALTERNATE_TYPE_TO_FEATURE_TAG: Record<
  Exclude<AlternateBehaviorType, 'customFeature'>,
  string
> = {
  stylisticAlternate: 'salt',
  swash: 'swsh',
  stylisticSet01: 'ss01',
  stylisticSet02: 'ss02',
  stylisticSet03: 'ss03',
  stylisticSet04: 'ss04',
  stylisticSet05: 'ss05',
}

export const FEATURE_TAG_TO_ALTERNATE_TYPE: Record<
  string,
  AlternateBehaviorType
> = {
  salt: 'stylisticAlternate',
  swsh: 'swash',
  ss01: 'stylisticSet01',
  ss02: 'stylisticSet02',
  ss03: 'stylisticSet03',
  ss04: 'stylisticSet04',
  ss05: 'stylisticSet05',
}

export const ALTERNATE_BEHAVIOR_TYPE_LABELS: Record<
  AlternateBehaviorType,
  string
> = {
  stylisticAlternate: 'Stylistic Alternate',
  swash: 'Swash',
  stylisticSet01: 'Stylistic Set 01',
  stylisticSet02: 'Stylistic Set 02',
  stylisticSet03: 'Stylistic Set 03',
  stylisticSet04: 'Stylistic Set 04',
  stylisticSet05: 'Stylistic Set 05',
  customFeature: 'Custom Feature',
}

export const ALTERNATE_BEHAVIOR_TYPES: AlternateBehaviorType[] = [
  'stylisticAlternate',
  'swash',
  'stylisticSet01',
  'stylisticSet02',
  'stylisticSet03',
  'stylisticSet04',
  'stylisticSet05',
  'customFeature',
]
