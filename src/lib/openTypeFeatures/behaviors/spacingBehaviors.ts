import { makeLookupId, makeRuleId } from '@/lib/openTypeFeatures/ids'
import { isValidGlyphName } from '@/lib/openTypeFeatures/validationNames'
import type {
  LookupRecord,
  OpenTypeFeaturesState,
  PairPositioningRule,
  Rule,
} from '@/lib/openTypeFeatures/types'
import type { FontData } from '@/domain'
import type {
  SpacingBehaviorDraft,
  SpacingBehaviorRow,
  SpacingBehaviorStatus,
} from '@/lib/openTypeFeatures/behaviorTypes'
import {
  ensureFeatureReferencesLookup,
  formatSourceLabel,
  mapFeatureTagsByLookupId,
  markFeatureOriginAsEdited,
  markLookupOriginAsEdited,
} from '@/lib/openTypeFeatures/behaviors/behaviorShared'

export function deriveGlyphSpacingBehaviors(
  fontData: FontData,
  glyphId: string
): SpacingBehaviorRow[] {
  const state = fontData.openTypeFeatures
  if (!state) return []

  const featureTagsByLookupId = mapFeatureTagsByLookupId(state.features)
  const duplicateKeys = countSpacingKeys(state.lookups)
  const glyphClassesById = new Map(
    state.glyphClasses.map((glyphClass) => [glyphClass.id, glyphClass])
  )

  return state.lookups.flatMap((lookup) => {
    if (lookup.table !== 'GPOS' || lookup.lookupType !== 'pairPos') {
      return []
    }

    const featureTag = featureTagsByLookupId.get(lookup.id)?.[0] ?? 'kern'
    if (featureTag !== 'kern') return []

    return lookup.rules.flatMap((rule) => {
      if (rule.kind !== 'pairPositioning') {
        return []
      }
      const leftContainsGlyph = selectorContainsGlyph(
        rule.left,
        glyphId,
        glyphClassesById
      )
      const rightContainsGlyph = selectorContainsGlyph(
        rule.right,
        glyphId,
        glyphClassesById
      )
      if (!leftContainsGlyph && !rightContainsGlyph) {
        return []
      }

      const value = rule.firstValue?.xAdvance ?? 0
      const left = spacingSelectorRepresentativeGlyph(
        rule.left,
        glyphId,
        glyphClassesById
      )
      const right = spacingSelectorRepresentativeGlyph(
        rule.right,
        glyphId,
        glyphClassesById
      )
      if (!left || !right) return []
      const duplicateCount =
        duplicateKeys.get(makeSpacingSelectorKey(rule.left, rule.right)) ?? 0
      const isClassBased =
        rule.left.kind === 'class' || rule.right.kind === 'class'

      return [
        {
          id: `${lookup.id}:${rule.id}`,
          lookupId: lookup.id,
          ruleId: rule.id,
          left,
          right,
          leftSelector: rule.left,
          rightSelector: rule.right,
          leftLabel: spacingSelectorLabel(rule.left, glyphClassesById),
          rightLabel: spacingSelectorLabel(rule.right, glyphClassesById),
          leftClass: spacingSelectorClassSummary(rule.left, glyphClassesById),
          rightClass: spacingSelectorClassSummary(rule.right, glyphClassesById),
          value,
          featureTag,
          origin: rule.meta.origin,
          sourceLabel: formatSourceLabel(rule.meta.origin, featureTag),
          scope: isClassBased ? 'classPair' : 'glyphPair',
          status: getSpacingStatus({
            fontData,
            left,
            right,
            value,
            duplicateCount,
          }),
        },
      ]
    })
  })
}

export function canCommitSpacingBehavior(draft: SpacingBehaviorDraft) {
  return (
    isValidGlyphName(draft.left.trim()) &&
    isValidGlyphName(draft.right.trim()) &&
    Number.isFinite(draft.value)
  )
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
      leftSelector: draft.leftSelector,
      rightSelector: draft.rightSelector,
      value,
    })
  ) {
    return state
  }

  const leftSelector = draft.leftSelector ?? {
    kind: 'glyph' as const,
    glyph: left,
  }
  const rightSelector = draft.rightSelector ?? {
    kind: 'glyph' as const,
    glyph: right,
  }
  const rule = makePairPositioningRule(left, right, value, {
    left: leftSelector,
    right: rightSelector,
  })
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
  next: {
    left: string
    right: string
    value: number
    leftSelector?: PairPositioningRule['left']
    rightSelector?: PairPositioningRule['right']
  }
) {
  const lookup = state.lookups.find((item) => item.id === lookupId)
  const rule = lookup?.rules.find((item) => item.id === ruleId)
  return (
    rule?.kind === 'pairPositioning' &&
    spacingSelectorEquals(
      rule.left,
      next.leftSelector ?? { kind: 'glyph', glyph: next.left }
    ) &&
    spacingSelectorEquals(
      rule.right,
      next.rightSelector ?? { kind: 'glyph', glyph: next.right }
    ) &&
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
              existingRule.id === ruleId
                ? { ...rule, id: existingRule.id }
                : existingRule
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

export function splitSpacingClassMember(
  state: OpenTypeFeaturesState,
  input: {
    lookupId: string
    ruleId: string
    side: 'left' | 'right'
    glyphId: string
    counterpartGlyphId: string
    value: number
  }
): OpenTypeFeaturesState {
  const glyphId = input.glyphId.trim()
  const counterpartGlyphId = input.counterpartGlyphId.trim()
  const value = Math.round(input.value)
  if (
    !isValidGlyphName(glyphId) ||
    !isValidGlyphName(counterpartGlyphId) ||
    !Number.isFinite(value)
  ) {
    return state
  }

  const lookup = state.lookups.find((item) => item.id === input.lookupId)
  const rule = lookup?.rules.find((item) => item.id === input.ruleId)
  if (
    lookup?.table !== 'GPOS' ||
    lookup.lookupType !== 'pairPos' ||
    rule?.kind !== 'pairPositioning'
  ) {
    return state
  }

  const selectorToSplit = input.side === 'left' ? rule.left : rule.right
  if (selectorToSplit.kind !== 'class') {
    return state
  }

  const nextGlyphClasses = state.glyphClasses.map((glyphClass) =>
    glyphClass.id === selectorToSplit.classId
      ? {
          ...glyphClass,
          origin: markFeatureOriginAsEdited(
            glyphClass.origin
          ) as Rule['meta']['origin'],
          meta: {
            ...glyphClass.meta,
            userOverridden: true,
          },
          glyphs: glyphClass.glyphs.filter((item) => item !== glyphId),
        }
      : glyphClass
  )
  const overrideRule =
    input.side === 'left'
      ? makePairPositioningRule(glyphId, counterpartGlyphId, value)
      : makePairPositioningRule(counterpartGlyphId, glyphId, value)

  return {
    ...state,
    glyphClasses: nextGlyphClasses,
    features: ensureFeatureReferencesLookup(
      state.features.map((feature) =>
        feature.entries.some((entry) =>
          entry.lookupIds.includes(input.lookupId)
        )
          ? { ...feature, origin: markFeatureOriginAsEdited(feature.origin) }
          : feature
      ),
      'kern',
      input.lookupId
    ),
    lookups: state.lookups.map((item) =>
      item.id === input.lookupId
        ? {
            ...item,
            origin: markLookupOriginAsEdited(item.origin),
            rules: [...item.rules, overrideRule],
          }
        : item
    ),
  }
}

function countSpacingKeys(lookups: LookupRecord[]) {
  const counts = new Map<string, number>()
  for (const lookup of lookups) {
    if (lookup.table !== 'GPOS' || lookup.lookupType !== 'pairPos') continue
    for (const rule of lookup.rules) {
      if (rule.kind !== 'pairPositioning') {
        continue
      }
      const key = makeSpacingSelectorKey(rule.left, rule.right)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function makeSpacingSelectorKey(
  left: PairPositioningRule['left'],
  right: PairPositioningRule['right']
) {
  return `${spacingSelectorKeyPart(left)}+${spacingSelectorKeyPart(right)}`
}

function spacingSelectorEquals(
  left: PairPositioningRule['left'],
  right: PairPositioningRule['left']
) {
  if (left.kind !== right.kind) return false
  return left.kind === 'glyph'
    ? right.kind === 'glyph' && left.glyph === right.glyph
    : right.kind === 'class' && left.classId === right.classId
}

function spacingSelectorKeyPart(selector: PairPositioningRule['left']) {
  return selector.kind === 'glyph'
    ? `glyph:${selector.glyph}`
    : `class:${selector.classId}`
}

function selectorContainsGlyph(
  selector: PairPositioningRule['left'],
  glyphId: string,
  glyphClassesById: Map<string, { glyphs: string[] }>
) {
  if (selector.kind === 'glyph') {
    return selector.glyph === glyphId
  }
  return (
    glyphClassesById.get(selector.classId)?.glyphs.includes(glyphId) ?? false
  )
}

function spacingSelectorRepresentativeGlyph(
  selector: PairPositioningRule['left'],
  glyphId: string,
  glyphClassesById: Map<string, { glyphs: string[] }>
) {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const glyphs = glyphClassesById.get(selector.classId)?.glyphs ?? []
  return glyphs.includes(glyphId) ? glyphId : (glyphs[0] ?? null)
}

function spacingSelectorLabel(
  selector: PairPositioningRule['left'],
  glyphClassesById: Map<string, { name: string; glyphs: string[] }>
) {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const glyphClass = glyphClassesById.get(selector.classId)
  return glyphClass
    ? `${glyphClass.name} (${glyphClass.glyphs.length})`
    : selector.classId
}

function spacingSelectorClassSummary(
  selector: PairPositioningRule['left'],
  glyphClassesById: Map<string, { id: string; name: string; glyphs: string[] }>
) {
  if (selector.kind !== 'class') {
    return undefined
  }
  const glyphClass = glyphClassesById.get(selector.classId)
  return glyphClass
    ? {
        id: glyphClass.id,
        name: glyphClass.name,
        glyphs: glyphClass.glyphs,
      }
    : undefined
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

function makePairPositioningRule(
  left: string,
  right: string,
  value: number,
  selectors: {
    left?: PairPositioningRule['left']
    right?: PairPositioningRule['right']
  } = {}
): Extract<Rule, { kind: 'pairPositioning' }> {
  const leftSelector = selectors.left ?? { kind: 'glyph' as const, glyph: left }
  const rightSelector = selectors.right ?? {
    kind: 'glyph' as const,
    glyph: right,
  }
  return {
    id: makeRuleId([
      'kern',
      spacingSelectorKeyPart(leftSelector),
      spacingSelectorKeyPart(rightSelector),
    ]),
    kind: 'pairPositioning',
    left: leftSelector,
    right: rightSelector,
    firstValue: { xAdvance: value },
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}
