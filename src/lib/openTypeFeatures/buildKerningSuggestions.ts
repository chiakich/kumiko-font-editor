import { makeRuleId } from 'src/lib/openTypeFeatures/ids'
import { createLookupSuggestion } from 'src/lib/openTypeFeatures/autoFeatureLookup'
import type {
  AutoFeatureSuggestion,
  GlyphClass,
  GlyphSelector,
  OpenTypeFeaturesState,
  PairPositioningRule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, KerningGroup, KerningPair } from 'src/store/types'

const ensureClassName = (name: string) =>
  name.startsWith('@') ? name : `@${name}`

const kerningClassForGroup = (group: KerningGroup): GlyphClass => {
  const name = ensureClassName(group.name)
  return {
    id: name,
    name,
    glyphs: group.glyphs,
    origin: 'auto',
    meta: {
      generatedBy: 'kerning-groups',
    },
  }
}

const classSelectorByGroupReference = (groups: KerningGroup[]) => {
  const selectors = new Map<string, GlyphSelector>()
  for (const group of groups) {
    const className = ensureClassName(group.name)
    const selector = { kind: 'class' as const, classId: className }
    selectors.set(group.id, selector)
    selectors.set(group.name, selector)
    selectors.set(className, selector)
  }
  return selectors
}

const resolveSelector = (
  selector: GlyphSelector,
  classSelectors: Map<string, GlyphSelector>
): GlyphSelector => {
  if (selector.kind === 'glyph') return selector
  return classSelectors.get(selector.classId) ?? selector
}

const makePairRule = (
  pair: KerningPair,
  classSelectors: Map<string, GlyphSelector>
): PairPositioningRule | null => {
  if (!Number.isFinite(pair.value) || pair.value === 0) return null
  const left = resolveSelector(pair.left, classSelectors)
  const right = resolveSelector(pair.right, classSelectors)
  return {
    id:
      pair.id ??
      makeRuleId([
        'kern',
        left.kind === 'class' ? left.classId : left.glyph,
        right.kind === 'class' ? right.classId : right.glyph,
        String(pair.value),
      ]),
    kind: 'pairPositioning',
    left,
    right,
    firstValue: { xAdvance: pair.value },
    meta: {
      origin: 'auto',
      generator: 'kerning-groups',
      confidence:
        left.kind === 'class' || right.kind === 'class' ? 'high' : 'medium',
      reason: 'Kerning pair from project kerning data.',
    },
  }
}

export const buildKerningSuggestions = (
  fontData: FontData,
  state: OpenTypeFeaturesState
): AutoFeatureSuggestion[] => {
  if (!state.autoFeatureConfig.kern) return []
  const groups = fontData.kerningGroups ?? []
  const pairs = fontData.kerningPairs ?? []
  if (pairs.length === 0) return []

  const classSelectors = classSelectorByGroupReference(groups)
  const rules = pairs
    .map((pair) => makePairRule(pair, classSelectors))
    .filter((rule): rule is PairPositioningRule => Boolean(rule))

  if (rules.length === 0) return []

  const suggestion = createLookupSuggestion({
    featureTag: 'kern',
    lookupType: 'pairPos',
    table: 'GPOS',
    rules,
    reason: `Generated ${rules.length} kerning rule${rules.length === 1 ? '' : 's'} from project kerning pairs without expanding class kerning.`,
    generator: 'kerning-groups',
  })

  return [
    {
      ...suggestion,
      glyphClasses: groups.map(kerningClassForGroup),
    },
  ]
}
