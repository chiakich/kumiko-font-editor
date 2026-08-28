import type {
  GlyphSelector,
  OpenTypeFeaturesState,
  Rule,
  ShapingTraceStep,
} from 'src/lib/openTypeFeatures'

export interface TraceRuleMatch {
  featureId: string
  featureTag: string
  lookupId: string
  lookupName: string
  ruleId: string | null
  rule: Rule | null
}

const selectorMatches = (
  selector: GlyphSelector,
  glyphName: string,
  state: OpenTypeFeaturesState
) => {
  if (selector.kind === 'glyph') {
    return selector.glyph === glyphName
  }
  const glyphClass = state.glyphClasses.find(
    (candidate) => candidate.id === selector.classId
  )
  return glyphClass?.glyphs.includes(glyphName) ?? false
}

const ruleMatchesStep = (
  rule: Rule,
  step: ShapingTraceStep,
  state: OpenTypeFeaturesState
): boolean => {
  const before = step.beforeNames
  const after = step.afterNames
  switch (rule.kind) {
    case 'singleSubstitution':
      return before.some(
        (name, index) =>
          selectorMatches(rule.target, name, state) &&
          (after[index] === rule.replacement ||
            after.includes(rule.replacement))
      )
    case 'ligatureSubstitution':
      return (
        after.includes(rule.replacement) &&
        rule.components.every((component) => before.includes(component))
      )
    case 'multipleSubstitution':
      return (
        before.includes(rule.target) &&
        rule.replacement.every((name) => after.includes(name))
      )
    case 'alternateSubstitution':
      return (
        before.includes(rule.target) &&
        after.some((name) => rule.alternates.includes(name))
      )
    case 'pairPositioning':
      return before.some(
        (name, index) =>
          selectorMatches(rule.left, name, state) &&
          before
            .slice(index + 1)
            .some((next) => selectorMatches(rule.right, next, state))
      )
    case 'singlePositioning':
      return before.some((name) => selectorMatches(rule.target, name, state))
    default:
      return false
  }
}

// Maps one HarfBuzz trace step back to the IR: the feature by tag, then the
// first rule whose shape explains the observed change. A tag can be spread
// over several IR features (per-script entries), so all of them are searched.
export const findRulesForTraceStep = (
  state: OpenTypeFeaturesState,
  step: ShapingTraceStep
): TraceRuleMatch[] => {
  const matches: TraceRuleMatch[] = []
  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  for (const feature of state.features) {
    if (feature.tag !== step.featureTag) {
      continue
    }
    const lookupIds = new Set(
      feature.entries.flatMap((entry) => entry.lookupIds)
    )
    let matched = false
    for (const lookupId of lookupIds) {
      const lookup = lookupById.get(lookupId)
      if (!lookup) {
        continue
      }
      for (const rule of lookup.rules) {
        if (ruleMatchesStep(rule, step, state)) {
          matches.push({
            featureId: feature.id,
            featureTag: feature.tag,
            lookupId: lookup.id,
            lookupName: lookup.name,
            ruleId: rule.id,
            rule,
          })
          matched = true
          break
        }
      }
      if (matched) {
        break
      }
    }
    if (!matched) {
      // The feature exists but the exact rule is not in the IR (raw-only or
      // contextual): still name the feature so the jump has a target.
      const firstLookup = lookupById.get([...lookupIds][0] ?? '')
      matches.push({
        featureId: feature.id,
        featureTag: feature.tag,
        lookupId: firstLookup?.id ?? '',
        lookupName: firstLookup?.name ?? '',
        ruleId: null,
        rule: null,
      })
    }
  }
  return matches
}
