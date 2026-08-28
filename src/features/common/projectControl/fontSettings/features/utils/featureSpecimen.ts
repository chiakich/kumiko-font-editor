import type {
  GlyphSelector,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures'

const MAX_SPECIMEN_GLYPHS = 6

const selectorGlyph = (
  selector: GlyphSelector,
  state: OpenTypeFeaturesState
): string | null => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const glyphClass = state.glyphClasses.find(
    (candidate) => candidate.id === selector.classId
  )
  return glyphClass?.glyphs[0] ?? null
}

const ruleSampleGlyphs = (
  rule: Rule,
  state: OpenTypeFeaturesState
): string[] => {
  switch (rule.kind) {
    case 'singleSubstitution':
      return [selectorGlyph(rule.target, state)].filter(
        (name): name is string => Boolean(name)
      )
    case 'ligatureSubstitution':
      return rule.components
    case 'multipleSubstitution':
    case 'alternateSubstitution':
      return [rule.target]
    case 'pairPositioning':
      return [
        selectorGlyph(rule.left, state),
        selectorGlyph(rule.right, state),
      ].filter((name): name is string => Boolean(name))
    case 'singlePositioning':
      return [selectorGlyph(rule.target, state)].filter(
        (name): name is string => Boolean(name)
      )
    case 'contextualSubstitution':
    case 'contextualPositioning':
      return rule.input
        .map((input) => selectorGlyph(input.selector, state))
        .filter((name): name is string => Boolean(name))
    default:
      return []
  }
}

// Picks the glyphs a feature's own rules act on, so the index can shape a
// sample that actually demonstrates the feature. Empty when the tag only
// lives in unclassified raw text — the row then shows no specimen.
export const buildFeatureSpecimenGlyphs = (
  state: OpenTypeFeaturesState,
  tag: string
): string[] => {
  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  const names: string[] = []
  const seen = new Set<string>()
  for (const feature of state.features) {
    if (feature.tag !== tag) {
      continue
    }
    for (const lookupId of feature.entries.flatMap(
      (entry) => entry.lookupIds
    )) {
      for (const rule of lookupById.get(lookupId)?.rules ?? []) {
        for (const name of ruleSampleGlyphs(rule, state)) {
          if (!seen.has(name)) {
            seen.add(name)
            names.push(name)
            if (names.length >= MAX_SPECIMEN_GLYPHS) {
              return names
            }
          }
        }
        // One rule per lookup is enough for a sample row.
        break
      }
    }
  }
  return names
}
