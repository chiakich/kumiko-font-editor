import {
  makeFeatureId,
  makeLookupId,
  makeRuleId,
  toStableIdPart,
} from 'src/lib/openTypeFeatures/ids'
import {
  isFourCharTag,
  isValidGlyphName,
} from 'src/lib/openTypeFeatures/validationNames'
import { getRuleGlyphReferences } from 'src/lib/openTypeFeatures/ruleReferences'
import type {
  AlternateSubstitutionRule,
  ContextualRule,
  FeatureRecord,
  LigatureSubstitutionRule,
  LookupRecord,
  OpenTypeFeaturesState,
  PairPositioningRule,
  Rule,
  SingleSubstitutionRule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, GlyphData } from 'src/store/types'

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
  value: number
  featureTag: 'kern'
  origin: Rule['meta']['origin']
  sourceLabel: string
  status: SpacingBehaviorStatus[]
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

const BEHAVIOR_TYPE_TO_FEATURE_TAG: Record<
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

const FEATURE_TAG_TO_BEHAVIOR_TYPE: Record<string, CombinationBehaviorType> = {
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

const ALTERNATE_TYPE_TO_FEATURE_TAG: Record<
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

const FEATURE_TAG_TO_ALTERNATE_TYPE: Record<string, AlternateBehaviorType> = {
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

export function deriveGlyphCombinationBehaviors(
  fontData: FontData,
  glyphId: string
): CombinationBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countLigatureKeys(state.lookups)
  const inputKeys = countLigatureInputs(state.lookups)

  return state.lookups.flatMap((lookup) => {
    if (lookup.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
      return []
    }

    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'liga'
    const type = FEATURE_TAG_TO_BEHAVIOR_TYPE[featureTag] ?? 'customFeature'

    return lookup.rules
      .filter(isLigatureRule)
      .filter(
        (rule) =>
          rule.components.includes(glyphId) || rule.replacement === glyphId
      )
      .map((rule) => {
        const input = formatCombinationInput(rule.components)
        const output = rule.replacement
        const status = getCombinationStatus({
          fontData,
          input,
          output,
          duplicateCount:
            duplicateKeys.get(makeLigatureKey(rule.components, output)) ?? 0,
          inputCount: inputKeys.get(rule.components.join('+')) ?? 0,
        })

        return {
          id: `${lookup.id}:${rule.id}`,
          lookupId: lookup.id,
          ruleId: rule.id,
          input,
          output,
          type,
          featureTag,
          origin: rule.meta.origin,
          sourceLabel: formatSourceLabel(rule.meta.origin, featureTag),
          status,
        }
      })
  })
}

export function deriveGlyphAlternateBehaviors(
  fontData: FontData,
  glyphId: string
): AlternateBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countAlternateKeys(state.lookups)
  const inputKeys = countAlternateSources(state.lookups)

  return state.lookups.flatMap((lookup) => {
    if (
      lookup.table !== 'GSUB' ||
      (lookup.lookupType !== 'singleSubst' &&
        lookup.lookupType !== 'alternateSubst')
    ) {
      return []
    }

    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'salt'
    const type = FEATURE_TAG_TO_ALTERNATE_TYPE[featureTag] ?? 'customFeature'

    return lookup.rules.flatMap((rule) => {
      if (isSingleSubstitutionRule(rule)) {
        if (
          rule.target.kind !== 'glyph' ||
          (rule.target.glyph !== glyphId && rule.replacement !== glyphId)
        ) {
          return []
        }
        return [
          makeAlternateRow({
            fontData,
            lookup,
            rule,
            source: rule.target.glyph,
            alternate: rule.replacement,
            featureTag,
            type,
            duplicateCount:
              duplicateKeys.get(
                makeAlternateKey(rule.target.glyph, rule.replacement)
              ) ?? 0,
            inputCount: inputKeys.get(rule.target.glyph) ?? 0,
          }),
        ]
      }

      if (isAlternateSubstitutionRule(rule)) {
        if (rule.target !== glyphId && !rule.alternates.includes(glyphId)) {
          return []
        }
        return rule.alternates.map((alternate) =>
          makeAlternateRow({
            fontData,
            lookup,
            rule,
            source: rule.target,
            alternate,
            featureTag,
            type,
            duplicateCount:
              duplicateKeys.get(makeAlternateKey(rule.target, alternate)) ?? 0,
            inputCount: inputKeys.get(rule.target) ?? 0,
          })
        )
      }

      return []
    })
  })
}

export function deriveGlyphSpacingBehaviors(
  fontData: FontData,
  glyphId: string
): SpacingBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countSpacingKeys(state.lookups)

  return state.lookups.flatMap((lookup) => {
    if (lookup.table !== 'GPOS' || lookup.lookupType !== 'pairPos') {
      return []
    }

    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'kern'
    if (featureTag !== 'kern') return []

    return lookup.rules.flatMap((rule) => {
      if (
        rule.kind !== 'pairPositioning' ||
        rule.left.kind !== 'glyph' ||
        rule.right.kind !== 'glyph'
      ) {
        return []
      }
      if (rule.left.glyph !== glyphId && rule.right.glyph !== glyphId) {
        return []
      }

      const value = rule.firstValue?.xAdvance ?? 0
      const duplicateCount =
        duplicateKeys.get(makeSpacingKey(rule.left.glyph, rule.right.glyph)) ??
        0

      return [
        {
          id: `${lookup.id}:${rule.id}`,
          lookupId: lookup.id,
          ruleId: rule.id,
          left: rule.left.glyph,
          right: rule.right.glyph,
          value,
          featureTag,
          origin: rule.meta.origin,
          sourceLabel: formatSourceLabel(rule.meta.origin, featureTag),
          status: getSpacingStatus({
            fontData,
            left: rule.left.glyph,
            right: rule.right.glyph,
            value,
            duplicateCount,
          }),
        },
      ]
    })
  })
}

export function deriveGlyphContextualBehaviors(
  fontData: FontData,
  glyphId: string
): ContextualBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countContextualKeys(state.lookups, lookupById)

  return state.lookups.flatMap((lookup) => {
    if (
      lookup.table !== 'GSUB' ||
      (lookup.lookupType !== 'contextSubst' &&
        lookup.lookupType !== 'chainingContextSubst')
    ) {
      return []
    }
    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'calt'
    if (featureTag !== 'calt') return []

    return lookup.rules.flatMap((rule) => {
      if (
        rule.kind !== 'contextualSubstitution' ||
        rule.input.length !== 1 ||
        rule.input[0]?.selector.kind !== 'glyph'
      ) {
        return []
      }

      const source = rule.input[0].selector.glyph
      const replacement = resolveContextualReplacement(
        rule.input[0].lookupIds,
        lookupById
      )
      if (!replacement) return []

      const before = formatContextTokens(rule.backtrack)
      const after = formatContextTokens(rule.lookahead)
      if (
        source !== glyphId &&
        replacement !== glyphId &&
        !parseContextInput(before).includes(glyphId) &&
        !parseContextInput(after).includes(glyphId)
      ) {
        return []
      }

      return [
        {
          id: `${lookup.id}:${rule.id}`,
          lookupId: lookup.id,
          ruleId: rule.id,
          source,
          replacement,
          before,
          after,
          featureTag,
          origin: rule.meta.origin,
          sourceLabel: formatSourceLabel(rule.meta.origin, featureTag),
          status: getContextualStatus({
            fontData,
            source,
            replacement,
            before,
            after,
            duplicateCount:
              duplicateKeys.get(
                makeContextualKey(source, replacement, before, after)
              ) ?? 0,
          }),
        },
      ]
    })
  })
}

export function deriveGlyphAnchorBehaviors(
  fontData: FontData,
  glyphId: string
): AnchorBehaviorRow[] {
  const glyph = fontData.glyphs[glyphId]
  if (!glyph) return []

  const duplicateNames = countAnchorNames(glyph.anchors ?? [])
  return (glyph.anchors ?? []).map((anchor) => ({
    id: anchor.id,
    glyphId,
    name: anchor.name,
    x: anchor.x,
    y: anchor.y,
    kind: anchor.name.startsWith('_') ? 'mark' : 'base',
    status: getAnchorStatus(anchor, duplicateNames.get(anchor.name) ?? 0),
  }))
}

export function parseCombinationInput(input: string) {
  return input
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function suggestCombinationOutput(input: string) {
  return parseCombinationInput(input).join('_')
}

export function suggestAlternateGlyphName(source: string) {
  return source ? `${source}.alt` : ''
}

export function resolveCombinationFeatureTag(draft: CombinationBehaviorDraft) {
  if (draft.type === 'customFeature') {
    return draft.customFeatureTag?.trim() ?? ''
  }

  return BEHAVIOR_TYPE_TO_FEATURE_TAG[draft.type]
}

export function resolveAlternateFeatureTag(draft: AlternateBehaviorDraft) {
  if (draft.type === 'customFeature') {
    return draft.customFeatureTag?.trim() ?? ''
  }

  return ALTERNATE_TYPE_TO_FEATURE_TAG[draft.type]
}

export function canCommitCombinationBehavior(draft: CombinationBehaviorDraft) {
  const components = parseCombinationInput(draft.input)
  const featureTag = resolveCombinationFeatureTag(draft)
  return (
    components.length > 0 &&
    components.every(isValidGlyphName) &&
    isValidGlyphName(draft.output.trim()) &&
    isFourCharTag(featureTag)
  )
}

export function canCommitAlternateBehavior(draft: AlternateBehaviorDraft) {
  const featureTag = resolveAlternateFeatureTag(draft)
  return (
    isValidGlyphName(draft.source.trim()) &&
    isValidGlyphName(draft.alternate.trim()) &&
    isFourCharTag(featureTag)
  )
}

export function canCommitSpacingBehavior(draft: SpacingBehaviorDraft) {
  return (
    isValidGlyphName(draft.left.trim()) &&
    isValidGlyphName(draft.right.trim()) &&
    Number.isFinite(draft.value)
  )
}

export function canCommitContextualBehavior(draft: ContextualBehaviorDraft) {
  const before = parseContextInput(draft.before)
  const after = parseContextInput(draft.after)
  return (
    isValidGlyphName(draft.source.trim()) &&
    isValidGlyphName(draft.replacement.trim()) &&
    [...before, ...after].every(isValidGlyphName) &&
    (before.length > 0 || after.length > 0)
  )
}

export function canCommitAnchorBehavior(draft: AnchorBehaviorDraft) {
  return (
    isValidAnchorName(draft.name.trim()) &&
    Number.isFinite(draft.x) &&
    Number.isFinite(draft.y)
  )
}

export function upsertCombinationBehavior(
  state: OpenTypeFeaturesState,
  draft: CombinationBehaviorDraft
): OpenTypeFeaturesState {
  const components = parseCombinationInput(draft.input)
  const replacement = draft.output.trim()
  const featureTag = resolveCombinationFeatureTag(draft)
  if (
    components.length === 0 ||
    !replacement ||
    !components.every(isValidGlyphName) ||
    !isValidGlyphName(replacement) ||
    !isFourCharTag(featureTag)
  ) {
    return state
  }

  const nextState = deleteCombinationBehavior(state, draft)
  const lookupId = findWritableLigatureLookupId(nextState, featureTag)
  const rule = makeCombinationRule(featureTag, components, replacement)

  if (lookupId) {
    return {
      ...nextState,
      features: ensureFeatureReferencesLookup(
        nextState.features,
        featureTag,
        lookupId
      ),
      lookups: nextState.lookups.map((lookup) =>
        lookup.id === lookupId
          ? {
              ...lookup,
              origin: markLookupOriginAsEdited(lookup.origin),
              rules: [...lookup.rules, rule],
            }
          : lookup
      ),
    }
  }

  const nextLookupId = makeLookupId(featureTag, 'behavior_combinations')
  const lookup: LookupRecord = {
    id: nextLookupId,
    name: nextLookupId,
    table: 'GSUB',
    lookupType: 'ligatureSubst',
    lookupFlag: {},
    rules: [rule],
    editable: true,
    origin: 'manual',
  }

  return {
    ...nextState,
    features: ensureFeatureReferencesLookup(
      nextState.features,
      featureTag,
      nextLookupId
    ),
    lookups: [...nextState.lookups, lookup],
  }
}

export function deleteCombinationBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<CombinationBehaviorDraft, 'lookupId' | 'ruleId'>
): OpenTypeFeaturesState {
  if (!target.lookupId || !target.ruleId) return state

  return {
    ...state,
    features: state.features.map((feature) =>
      feature.entries.some((entry) =>
        entry.lookupIds.includes(target.lookupId ?? '')
      )
        ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
        : feature
    ),
    lookups: state.lookups.map((lookup) =>
      lookup.id === target.lookupId
        ? {
            ...lookup,
            origin: markLookupOriginAsEdited(lookup.origin),
            rules: lookup.rules.filter((rule) => rule.id !== target.ruleId),
          }
        : lookup
    ),
  }
}

export function upsertAlternateBehavior(
  state: OpenTypeFeaturesState,
  draft: AlternateBehaviorDraft
): OpenTypeFeaturesState {
  const source = draft.source.trim()
  const alternate = draft.alternate.trim()
  const featureTag = resolveAlternateFeatureTag(draft)
  if (
    !isValidGlyphName(source) ||
    !isValidGlyphName(alternate) ||
    !isFourCharTag(featureTag)
  ) {
    return state
  }

  const nextState = deleteAlternateBehavior(state, draft)
  const lookupId = findWritableSingleSubstitutionLookupId(nextState, featureTag)
  const rule = makeSingleSubstitutionRule(featureTag, source, alternate)

  if (lookupId) {
    return {
      ...nextState,
      features: ensureFeatureReferencesLookup(
        nextState.features,
        featureTag,
        lookupId
      ),
      lookups: nextState.lookups.map((lookup) =>
        lookup.id === lookupId
          ? {
              ...lookup,
              origin: markLookupOriginAsEdited(lookup.origin),
              rules: [...lookup.rules, rule],
            }
          : lookup
      ),
    }
  }

  const nextLookupId = makeLookupId(featureTag, 'behavior_alternates')
  const lookup: LookupRecord = {
    id: nextLookupId,
    name: nextLookupId,
    table: 'GSUB',
    lookupType: 'singleSubst',
    lookupFlag: {},
    rules: [rule],
    editable: true,
    origin: 'manual',
  }

  return {
    ...nextState,
    features: ensureFeatureReferencesLookup(
      nextState.features,
      featureTag,
      nextLookupId
    ),
    lookups: [...nextState.lookups, lookup],
  }
}

export function deleteAlternateBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<AlternateBehaviorDraft, 'lookupId' | 'ruleId' | 'alternate'>
): OpenTypeFeaturesState {
  if (!target.lookupId || !target.ruleId) return state

  return {
    ...state,
    features: state.features.map((feature) =>
      feature.entries.some((entry) =>
        entry.lookupIds.includes(target.lookupId ?? '')
      )
        ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
        : feature
    ),
    lookups: state.lookups.map((lookup) => {
      if (lookup.id !== target.lookupId) return lookup

      return {
        ...lookup,
        origin: markLookupOriginAsEdited(lookup.origin),
        rules: lookup.rules.flatMap((rule) => {
          if (rule.id !== target.ruleId) return [rule]
          if (!isAlternateSubstitutionRule(rule)) return []

          const alternates = rule.alternates.filter(
            (alternate) => alternate !== target.alternate
          )
          return alternates.length > 0 ? [{ ...rule, alternates }] : []
        }),
      }
    }),
  }
}

export function upsertSpacingBehavior(
  state: OpenTypeFeaturesState,
  draft: SpacingBehaviorDraft
): OpenTypeFeaturesState {
  const left = draft.left.trim()
  const right = draft.right.trim()
  const value = Math.round(draft.value)
  if (
    !isValidGlyphName(left) ||
    !isValidGlyphName(right) ||
    !Number.isFinite(value)
  ) {
    return state
  }
  if (
    draft.lookupId &&
    draft.ruleId &&
    isUnchangedSpacingBehavior(state, draft.lookupId, draft.ruleId, {
      left,
      right,
      value,
    })
  ) {
    return state
  }

  const rule = makePairPositioningRule(left, right, value)
  const replacedState =
    draft.lookupId && draft.ruleId
      ? replaceSpacingBehaviorInPlace(state, draft.lookupId, draft.ruleId, rule)
      : null
  if (replacedState) {
    return replacedState
  }

  const nextState = deleteSpacingBehavior(state, draft)
  const lookupId = findWritablePairPositioningLookupId(nextState)

  if (lookupId) {
    return {
      ...nextState,
      features: ensureFeatureReferencesLookup(
        nextState.features,
        'kern',
        lookupId
      ),
      lookups: nextState.lookups.map((lookup) =>
        lookup.id === lookupId
          ? {
              ...lookup,
              origin: markLookupOriginAsEdited(lookup.origin),
              rules: [...lookup.rules, rule],
            }
          : lookup
      ),
    }
  }

  const nextLookupId = makeLookupId('kern', 'behavior_spacing')
  const lookup: LookupRecord = {
    id: nextLookupId,
    name: nextLookupId,
    table: 'GPOS',
    lookupType: 'pairPos',
    lookupFlag: {},
    rules: [rule],
    editable: true,
    origin: 'manual',
  }

  return {
    ...nextState,
    features: ensureFeatureReferencesLookup(
      nextState.features,
      'kern',
      nextLookupId
    ),
    lookups: [...nextState.lookups, lookup],
  }
}

function isUnchangedSpacingBehavior(
  state: OpenTypeFeaturesState,
  lookupId: string,
  ruleId: string,
  next: { left: string; right: string; value: number }
) {
  const lookup = state.lookups.find((item) => item.id === lookupId)
  const rule = lookup?.rules.find((item) => item.id === ruleId)
  return (
    rule?.kind === 'pairPositioning' &&
    rule.left.kind === 'glyph' &&
    rule.right.kind === 'glyph' &&
    rule.left.glyph === next.left &&
    rule.right.glyph === next.right &&
    (rule.firstValue?.xAdvance ?? 0) === next.value
  )
}

function replaceSpacingBehaviorInPlace(
  state: OpenTypeFeaturesState,
  lookupId: string,
  ruleId: string,
  rule: PairPositioningRule
) {
  const lookup = state.lookups.find((item) => item.id === lookupId)
  if (
    lookup?.table !== 'GPOS' ||
    lookup.lookupType !== 'pairPos' ||
    !lookup.rules.some((item) => item.id === ruleId)
  ) {
    return null
  }

  return {
    ...state,
    features: ensureFeatureReferencesLookup(
      state.features.map((feature) =>
        feature.entries.some((entry) => entry.lookupIds.includes(lookupId))
          ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
          : feature
      ),
      'kern',
      lookupId
    ),
    lookups: state.lookups.map((item) =>
      item.id === lookupId
        ? {
            ...item,
            origin: markLookupOriginAsEdited(item.origin),
            rules: item.rules.map((existingRule) =>
              existingRule.id === ruleId ? rule : existingRule
            ),
          }
        : item
    ),
  }
}

export function deleteSpacingBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<SpacingBehaviorDraft, 'lookupId' | 'ruleId'>
): OpenTypeFeaturesState {
  if (!target.lookupId || !target.ruleId) return state

  return {
    ...state,
    features: state.features.map((feature) =>
      feature.entries.some((entry) =>
        entry.lookupIds.includes(target.lookupId ?? '')
      )
        ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
        : feature
    ),
    lookups: state.lookups.map((lookup) =>
      lookup.id === target.lookupId
        ? {
            ...lookup,
            origin: markLookupOriginAsEdited(lookup.origin),
            rules: lookup.rules.filter((rule) => rule.id !== target.ruleId),
          }
        : lookup
    ),
  }
}

export function upsertContextualBehavior(
  state: OpenTypeFeaturesState,
  draft: ContextualBehaviorDraft
): OpenTypeFeaturesState {
  const source = draft.source.trim()
  const replacement = draft.replacement.trim()
  const before = parseContextInput(draft.before)
  const after = parseContextInput(draft.after)
  if (!canCommitContextualBehavior(draft)) return state

  const nextState = deleteContextualBehavior(state, draft)
  const helperLookup = makeContextualHelperLookup(source, replacement)
  const contextLookupId =
    findWritableContextualLookupId(nextState) ??
    makeLookupId('calt', 'behavior_contextual')
  const helperLookupExists = nextState.lookups.some(
    (lookup) => lookup.id === helperLookup.id
  )
  const contextRule = makeContextualRule({
    source,
    replacement,
    before,
    after,
    helperLookupId: helperLookup.id,
  })
  const contextLookupExists = nextState.lookups.some(
    (lookup) => lookup.id === contextLookupId
  )

  return {
    ...nextState,
    features: ensureFeatureReferencesLookup(
      nextState.features,
      'calt',
      contextLookupId
    ),
    lookups: [
      ...nextState.lookups.map((lookup) => {
        if (lookup.id === contextLookupId) {
          return {
            ...lookup,
            origin: markLookupOriginAsEdited(lookup.origin),
            rules: [...lookup.rules, contextRule],
          }
        }
        return lookup
      }),
      ...(contextLookupExists
        ? []
        : [
            {
              id: contextLookupId,
              name: contextLookupId,
              table: 'GSUB' as const,
              lookupType: 'chainingContextSubst' as const,
              lookupFlag: {},
              rules: [contextRule],
              editable: true,
              origin: 'manual' as const,
            },
          ]),
      ...(helperLookupExists ? [] : [helperLookup]),
    ],
  }
}

export function deleteContextualBehavior(
  state: OpenTypeFeaturesState,
  target: Pick<ContextualBehaviorDraft, 'lookupId' | 'ruleId'>
): OpenTypeFeaturesState {
  if (!target.lookupId || !target.ruleId) return state

  return {
    ...state,
    features: state.features.map((feature) =>
      feature.entries.some((entry) =>
        entry.lookupIds.includes(target.lookupId ?? '')
      )
        ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
        : feature
    ),
    lookups: state.lookups.map((lookup) =>
      lookup.id === target.lookupId
        ? {
            ...lookup,
            origin: markLookupOriginAsEdited(lookup.origin),
            rules: lookup.rules.filter((rule) => rule.id !== target.ruleId),
          }
        : lookup
    ),
  }
}

export function upsertAnchorBehavior(
  fontData: FontData,
  draft: AnchorBehaviorDraft
): FontData {
  if (!canCommitAnchorBehavior(draft)) return fontData
  const glyph = fontData.glyphs[draft.glyphId]
  if (!glyph) return fontData

  const anchor = {
    id: draft.id ?? makeAnchorId(draft.glyphId, draft.name),
    name: draft.name.trim(),
    x: Math.round(draft.x),
    y: Math.round(draft.y),
  }
  const anchors = glyph.anchors ?? []
  const nextAnchors = anchors.some((item) => item.id === anchor.id)
    ? anchors.map((item) => (item.id === anchor.id ? anchor : item))
    : [...anchors, anchor]

  const nextFontData = {
    ...fontData,
    glyphs: {
      ...fontData.glyphs,
      [draft.glyphId]: {
        ...glyph,
        anchors: nextAnchors,
      },
    },
  }

  return syncOpenTypeAnchorDefinitions(nextFontData, draft.glyphId)
}

export function deleteAnchorBehavior(
  fontData: FontData,
  glyphId: string,
  anchorId: string
): FontData {
  const glyph = fontData.glyphs[glyphId]
  if (!glyph) return fontData

  const nextFontData = {
    ...fontData,
    glyphs: {
      ...fontData.glyphs,
      [glyphId]: {
        ...glyph,
        anchors: (glyph.anchors ?? []).filter(
          (anchor) => anchor.id !== anchorId
        ),
      },
    },
  }

  return syncOpenTypeAnchorDefinitions(nextFontData, glyphId)
}

export function makeCompositeGlyphFromComponents(
  fontData: FontData,
  glyphId: string,
  componentGlyphIds: string[]
): GlyphData | null {
  if (!isValidGlyphName(glyphId) || fontData.glyphs[glyphId]) return null
  if (componentGlyphIds.some((componentId) => !fontData.glyphs[componentId])) {
    return null
  }

  let cursorX = 0
  const paths: GlyphData['paths'] = []
  const componentRefs = componentGlyphIds.map((componentId, index) => {
    const sourceGlyph = fontData.glyphs[componentId]
    const ref = {
      id: `component_${index}_${componentId.replace(/[^A-Za-z0-9_.-]+/g, '_')}`,
      glyphId: componentId,
      x: cursorX,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }
    for (const path of sourceGlyph?.paths ?? []) {
      paths.push({
        id: `${componentId}_${index}_${path.id}`,
        closed: path.closed,
        nodes: path.nodes.map((node) => ({
          ...node,
          id: `${componentId}_${index}_${node.id}`,
          x: Math.round(node.x + cursorX),
        })),
      })
    }
    cursorX += sourceGlyph?.metrics.width ?? 0
    return ref
  })

  const width =
    cursorX || Object.values(fontData.glyphs)[0]?.metrics.width || 1000

  return {
    id: glyphId,
    name: glyphId,
    unicode: null,
    export: true,
    activeLayerId:
      Object.values(fontData.glyphs)[0]?.activeLayerId ?? 'public.default',
    paths,
    components: paths.length === 0 ? componentGlyphIds : [],
    componentRefs: paths.length === 0 ? componentRefs : [],
    anchors: [],
    guidelines: [],
    metrics: {
      width,
      lsb: 0,
      rsb: width,
    },
  }
}

export function makeEditableGlyphCopy(
  fontData: FontData,
  glyphId: string,
  sourceGlyphId: string
): GlyphData | null {
  if (!isValidGlyphName(glyphId) || fontData.glyphs[glyphId]) return null
  const sourceGlyph = fontData.glyphs[sourceGlyphId]
  if (!sourceGlyph) return null

  return {
    ...sourceGlyph,
    id: glyphId,
    name: glyphId,
    unicode: null,
    paths: sourceGlyph.paths.map((path) => ({
      ...path,
      id: `${glyphId}_${path.id}`,
      nodes: path.nodes.map((node) => ({
        ...node,
        id: `${glyphId}_${node.id}`,
      })),
    })),
    components: [...sourceGlyph.components],
    componentRefs: sourceGlyph.componentRefs.map((componentRef) => ({
      ...componentRef,
      id: `${glyphId}_${componentRef.id}`,
    })),
    anchors: (sourceGlyph.anchors ?? []).map((anchor) => ({
      ...anchor,
      id: `${glyphId}_${anchor.id}`,
    })),
    guidelines: (sourceGlyph.guidelines ?? []).map((guideline) => ({
      ...guideline,
      id: `${glyphId}_${guideline.id}`,
    })),
    layers: undefined,
    layerOrder: undefined,
  }
}

export function isGlyphReferencedByOpenTypeBehaviors(
  state: OpenTypeFeaturesState | null | undefined,
  glyphId: string,
  ignoredTarget: BehaviorRuleReferenceTarget = {}
) {
  if (!state) return false

  return state.lookups.some((lookup) =>
    lookup.rules.some((rule) => {
      if (
        ignoredTarget.lookupId === lookup.id &&
        ignoredTarget.ruleId === rule.id
      ) {
        if (
          ignoredTarget.alternate &&
          isAlternateSubstitutionRule(rule) &&
          rule.alternates.length > 1
        ) {
          return rule.alternates
            .filter((alternate) => alternate !== ignoredTarget.alternate)
            .includes(glyphId)
        }
        return false
      }

      return getRuleGlyphReferences(rule).includes(glyphId)
    })
  )
}

function mapFeatureTagsByLookupId(features: FeatureRecord[]) {
  const tagsByLookupId = new Map<string, string[]>()
  for (const feature of features) {
    for (const lookupId of feature.entries.flatMap(
      (entry) => entry.lookupIds
    )) {
      tagsByLookupId.set(lookupId, [
        ...(tagsByLookupId.get(lookupId) ?? []),
        feature.tag,
      ])
    }
  }
  return tagsByLookupId
}

function countLigatureKeys(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
      continue
    }
    for (const rule of lookup.rules) {
      if (!isLigatureRule(rule)) continue
      const key = makeLigatureKey(rule.components, rule.replacement)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function countLigatureInputs(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB' || lookup.lookupType !== 'ligatureSubst') {
      continue
    }
    for (const rule of lookup.rules) {
      if (!isLigatureRule(rule)) continue
      const key = rule.components.join('+')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function getCombinationStatus(input: {
  fontData: FontData
  input: string
  output: string
  duplicateCount: number
  inputCount: number
}): CombinationBehaviorStatus[] {
  const components = parseCombinationInput(input.input)
  const status: CombinationBehaviorStatus[] = []
  if (
    components.length === 0 ||
    !components.every(isValidGlyphName) ||
    !isValidGlyphName(input.output)
  ) {
    status.push('Invalid Input')
  }
  if (
    components.some((component) => !input.fontData.glyphs[component]) ||
    !input.fontData.glyphs[input.output]
  ) {
    status.push('Missing Glyph')
  }
  if (input.duplicateCount > 1) {
    status.push('Duplicate')
  }
  if (input.inputCount > 1 && input.duplicateCount === 1) {
    status.push('Conflict')
  }
  return status
}

function makeAlternateRow(input: {
  fontData: FontData
  lookup: LookupRecord
  rule: SingleSubstitutionRule | AlternateSubstitutionRule
  source: string
  alternate: string
  featureTag: string
  type: AlternateBehaviorType
  duplicateCount: number
  inputCount: number
}): AlternateBehaviorRow {
  return {
    id: `${input.lookup.id}:${input.rule.id}:${input.alternate}`,
    lookupId: input.lookup.id,
    ruleId: input.rule.id,
    source: input.source,
    alternate: input.alternate,
    type: input.type,
    featureTag: input.featureTag,
    origin: input.rule.meta.origin,
    sourceLabel: formatSourceLabel(input.rule.meta.origin, input.featureTag),
    status: getAlternateStatus(input),
  }
}

function getAlternateStatus(input: {
  fontData: FontData
  source: string
  alternate: string
  duplicateCount: number
  inputCount: number
}): AlternateBehaviorStatus[] {
  const status: AlternateBehaviorStatus[] = []
  if (!isValidGlyphName(input.source) || !isValidGlyphName(input.alternate)) {
    status.push('Invalid Input')
  }
  if (
    !input.fontData.glyphs[input.source] ||
    !input.fontData.glyphs[input.alternate]
  ) {
    status.push('Missing Glyph')
  }
  if (input.duplicateCount > 1) {
    status.push('Duplicate')
  }
  if (input.inputCount > 1 && input.duplicateCount === 1) {
    status.push('Conflict')
  }
  return status
}

function countAlternateKeys(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB') continue
    for (const rule of lookup.rules) {
      if (isSingleSubstitutionRule(rule) && rule.target.kind === 'glyph') {
        const key = makeAlternateKey(rule.target.glyph, rule.replacement)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      if (isAlternateSubstitutionRule(rule)) {
        for (const alternate of rule.alternates) {
          const key = makeAlternateKey(rule.target, alternate)
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
    }
  }
  return counts
}

function countAlternateSources(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GSUB') continue
    for (const rule of lookup.rules) {
      if (isSingleSubstitutionRule(rule) && rule.target.kind === 'glyph') {
        counts.set(rule.target.glyph, (counts.get(rule.target.glyph) ?? 0) + 1)
      }
      if (isAlternateSubstitutionRule(rule)) {
        counts.set(
          rule.target,
          (counts.get(rule.target) ?? 0) + rule.alternates.length
        )
      }
    }
  }
  return counts
}

function makeAlternateKey(source: string, alternate: string) {
  return `${source}=>${alternate}`
}

function countSpacingKeys(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GPOS' || lookup.lookupType !== 'pairPos') continue
    for (const rule of lookup.rules) {
      if (
        rule.kind !== 'pairPositioning' ||
        rule.left.kind !== 'glyph' ||
        rule.right.kind !== 'glyph'
      ) {
        continue
      }
      const key = makeSpacingKey(rule.left.glyph, rule.right.glyph)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function makeSpacingKey(left: string, right: string) {
  return `${left}+${right}`
}

function getSpacingStatus(input: {
  fontData: FontData
  left: string
  right: string
  value: number
  duplicateCount: number
}): SpacingBehaviorStatus[] {
  const status: SpacingBehaviorStatus[] = []
  if (
    !isValidGlyphName(input.left) ||
    !isValidGlyphName(input.right) ||
    !Number.isFinite(input.value)
  ) {
    status.push('Invalid Input')
  }
  if (
    !input.fontData.glyphs[input.left] ||
    !input.fontData.glyphs[input.right]
  ) {
    status.push('Missing Glyph')
  }
  if (input.duplicateCount > 1) {
    status.push('Duplicate')
  }
  return status
}

function parseContextInput(input: string) {
  return input
    .split(/[+\s]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function formatContextTokens(
  selectors: Array<{ kind: string; glyph?: string }>
) {
  return selectors
    .map((selector) => (selector.kind === 'glyph' ? selector.glyph : null))
    .filter((glyph): glyph is string => Boolean(glyph))
    .join('+')
}

function countContextualKeys(
  lookups: LookupRecord[],
  lookupById: Map<string, LookupRecord>
) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (
      lookup.table !== 'GSUB' ||
      (lookup.lookupType !== 'contextSubst' &&
        lookup.lookupType !== 'chainingContextSubst')
    ) {
      continue
    }
    for (const rule of lookup.rules) {
      if (
        rule.kind !== 'contextualSubstitution' ||
        rule.input.length !== 1 ||
        rule.input[0]?.selector.kind !== 'glyph'
      ) {
        continue
      }
      const source = rule.input[0].selector.glyph
      const replacement = resolveContextualReplacement(
        rule.input[0].lookupIds,
        lookupById
      )
      if (!replacement) continue
      const key = makeContextualKey(
        source,
        replacement,
        formatContextTokens(rule.backtrack),
        formatContextTokens(rule.lookahead)
      )
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function resolveContextualReplacement(
  lookupIds: string[] | undefined,
  lookupById: Map<string, LookupRecord>
) {
  for (const lookupId of lookupIds ?? []) {
    const lookup = lookupById.get(lookupId)
    const rule = lookup?.rules.find(
      (candidate): candidate is SingleSubstitutionRule =>
        candidate.kind === 'singleSubstitution' &&
        candidate.target.kind === 'glyph'
    )
    if (rule) return rule.replacement
  }
  return null
}

function makeContextualKey(
  source: string,
  replacement: string,
  before: string,
  after: string
) {
  return `${before}|${source}->${replacement}|${after}`
}

function getContextualStatus(input: {
  fontData: FontData
  source: string
  replacement: string
  before: string
  after: string
  duplicateCount: number
}): ContextualBehaviorStatus[] {
  const status: ContextualBehaviorStatus[] = []
  const contextGlyphs = [
    ...parseContextInput(input.before),
    ...parseContextInput(input.after),
  ]
  if (
    !isValidGlyphName(input.source) ||
    !isValidGlyphName(input.replacement) ||
    !contextGlyphs.every(isValidGlyphName) ||
    contextGlyphs.length === 0
  ) {
    status.push('Invalid Input')
  }
  if (
    !input.fontData.glyphs[input.source] ||
    !input.fontData.glyphs[input.replacement] ||
    contextGlyphs.some((glyph) => !input.fontData.glyphs[glyph])
  ) {
    status.push('Missing Glyph')
  }
  if (input.duplicateCount > 1) {
    status.push('Duplicate')
  }
  return status
}

function countAnchorNames(anchors: Array<{ name: string }>) {
  const counts = new Map<string, number>()
  for (const anchor of anchors) {
    counts.set(anchor.name, (counts.get(anchor.name) ?? 0) + 1)
  }
  return counts
}

function getAnchorStatus(
  anchor: { name: string; x: number; y: number },
  duplicateCount: number
): AnchorBehaviorStatus[] {
  const status: AnchorBehaviorStatus[] = []
  if (
    !isValidAnchorName(anchor.name) ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y)
  ) {
    status.push('Invalid Input')
  }
  if (duplicateCount > 1) {
    status.push('Duplicate')
  }
  return status
}

function isValidAnchorName(name: string) {
  return /^_?[A-Za-z][A-Za-z0-9_.-]*$/.test(name)
}

function makeAnchorId(glyphId: string, name: string) {
  return `anchor_${toStableIdPart(glyphId)}_${toStableIdPart(name)}_${Date.now()}`
}

function formatCombinationInput(components: string[]) {
  return components.join('+')
}

function makeLigatureKey(components: string[], replacement: string) {
  return `${components.join('+')}=>${replacement}`
}

function formatSourceLabel(origin: Rule['meta']['origin'], featureTag: string) {
  const source =
    origin === 'imported'
      ? 'Imported'
      : origin === 'auto'
        ? 'Generated'
        : 'Manual'
  return `${source} · ${featureTag}`
}

function isLigatureRule(rule: Rule): rule is LigatureSubstitutionRule {
  return rule.kind === 'ligatureSubstitution'
}

function isSingleSubstitutionRule(rule: Rule): rule is SingleSubstitutionRule {
  return rule.kind === 'singleSubstitution'
}

function isAlternateSubstitutionRule(
  rule: Rule
): rule is AlternateSubstitutionRule {
  return rule.kind === 'alternateSubstitution'
}

function findWritableLigatureLookupId(
  state: OpenTypeFeaturesState,
  featureTag: string
) {
  const feature = state.features.find((item) => item.tag === featureTag)
  const lookupIds = new Set(
    feature?.entries.flatMap((entry) => entry.lookupIds)
  )

  return state.lookups.find(
    (lookup) =>
      lookupIds.has(lookup.id) &&
      lookup.table === 'GSUB' &&
      lookup.lookupType === 'ligatureSubst' &&
      lookup.editable
  )?.id
}

function findWritableSingleSubstitutionLookupId(
  state: OpenTypeFeaturesState,
  featureTag: string
) {
  const feature = state.features.find((item) => item.tag === featureTag)
  const lookupIds = new Set(
    feature?.entries.flatMap((entry) => entry.lookupIds)
  )

  return state.lookups.find(
    (lookup) =>
      lookupIds.has(lookup.id) &&
      lookup.table === 'GSUB' &&
      lookup.lookupType === 'singleSubst' &&
      lookup.editable
  )?.id
}

function findWritablePairPositioningLookupId(state: OpenTypeFeaturesState) {
  const feature = state.features.find((item) => item.tag === 'kern')
  const lookupIds = new Set(
    feature?.entries.flatMap((entry) => entry.lookupIds)
  )

  return state.lookups.find(
    (lookup) =>
      lookupIds.has(lookup.id) &&
      lookup.table === 'GPOS' &&
      lookup.lookupType === 'pairPos' &&
      lookup.editable
  )?.id
}

function findWritableContextualLookupId(state: OpenTypeFeaturesState) {
  const feature = state.features.find((item) => item.tag === 'calt')
  const lookupIds = new Set(
    feature?.entries.flatMap((entry) => entry.lookupIds)
  )

  return state.lookups.find(
    (lookup) =>
      lookupIds.has(lookup.id) &&
      lookup.table === 'GSUB' &&
      (lookup.lookupType === 'contextSubst' ||
        lookup.lookupType === 'chainingContextSubst') &&
      lookup.editable
  )?.id
}

function ensureFeatureReferencesLookup(
  features: FeatureRecord[],
  featureTag: string,
  lookupId: string
): FeatureRecord[] {
  const feature = features.find((item) => item.tag === featureTag)
  if (!feature) {
    return [
      ...features,
      {
        id: makeFeatureId(featureTag),
        tag: featureTag,
        isActive: true,
        entries: [
          {
            id: `entry_${featureTag}_DFLT_dflt`,
            script: 'DFLT',
            language: 'dflt',
            lookupIds: [lookupId],
          },
        ],
        origin: 'manual',
      },
    ]
  }

  return features.map((item) => {
    if (item.id !== feature.id) return item
    if (item.entries.some((entry) => entry.lookupIds.includes(lookupId))) {
      return {
        ...item,
        origin: markFeatureOriginAsEdited(item.origin),
      }
    }

    const [firstEntry, ...restEntries] = item.entries
    const entries = firstEntry
      ? [
          {
            ...firstEntry,
            lookupIds: [...firstEntry.lookupIds, lookupId],
          },
          ...restEntries,
        ]
      : [
          {
            id: `entry_${featureTag}_${lookupId}`,
            script: 'DFLT',
            language: 'dflt',
            lookupIds: [lookupId],
          },
        ]

    return {
      ...item,
      origin: markFeatureOriginAsEdited(item.origin),
      entries,
    }
  })
}

function makeCombinationRule(
  featureTag: string,
  components: string[],
  replacement: string
): LigatureSubstitutionRule {
  return {
    id: makeRuleId([featureTag, ...components, replacement]),
    kind: 'ligatureSubstitution',
    components,
    replacement,
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}

function makeSingleSubstitutionRule(
  featureTag: string,
  source: string,
  alternate: string
): SingleSubstitutionRule {
  return {
    id: makeRuleId([featureTag, source, alternate]),
    kind: 'singleSubstitution',
    target: { kind: 'glyph', glyph: source },
    replacement: alternate,
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}

function makePairPositioningRule(
  left: string,
  right: string,
  value: number
): Extract<Rule, { kind: 'pairPositioning' }> {
  return {
    id: makeRuleId(['kern', left, right]),
    kind: 'pairPositioning',
    left: { kind: 'glyph', glyph: left },
    right: { kind: 'glyph', glyph: right },
    firstValue: { xAdvance: value },
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}

function makeContextualHelperLookup(
  source: string,
  replacement: string
): LookupRecord {
  const lookupId = makeLookupId(
    'calt',
    `behavior_contextual_${source}_${replacement}`
  )
  return {
    id: lookupId,
    name: lookupId,
    table: 'GSUB',
    lookupType: 'singleSubst',
    lookupFlag: {},
    rules: [makeSingleSubstitutionRule('calt', source, replacement)],
    editable: true,
    origin: 'manual',
  }
}

function makeContextualRule(input: {
  source: string
  replacement: string
  before: string[]
  after: string[]
  helperLookupId: string
}): ContextualRule {
  return {
    id: makeRuleId([
      'calt',
      ...input.before,
      input.source,
      input.replacement,
      ...input.after,
    ]),
    kind: 'contextualSubstitution',
    mode: input.before.length > 0 ? 'chaining' : 'context',
    backtrack: input.before.map((glyph) => ({ kind: 'glyph', glyph })),
    input: [
      {
        selector: { kind: 'glyph', glyph: input.source },
        lookupIds: [input.helperLookupId],
      },
    ],
    lookahead: input.after.map((glyph) => ({ kind: 'glyph', glyph })),
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}

function syncOpenTypeAnchorDefinitions(fontData: FontData, glyphId: string) {
  const openTypeFeatures = fontData.openTypeFeatures
  if (!openTypeFeatures) return fontData

  const glyph = fontData.glyphs[glyphId]
  return {
    ...fontData,
    openTypeFeatures: {
      ...openTypeFeatures,
      anchors: [
        ...openTypeFeatures.anchors.filter(
          (anchor) => anchor.glyph !== glyphId
        ),
        ...((glyph?.anchors ?? []).map((anchor) => ({
          id: anchor.id,
          glyph: glyphId,
          name: anchor.name,
          x: anchor.x,
          y: anchor.y,
        })) ?? []),
      ],
    },
  }
}

function markLookupOriginAsEdited(
  origin: LookupRecord['origin']
): LookupRecord['origin'] {
  return origin === 'unsupported' ? origin : 'manual'
}

function markFeatureOriginAsEdited(origin: FeatureRecord['origin']) {
  return origin === 'manual' ? 'manual' : 'mixed'
}
