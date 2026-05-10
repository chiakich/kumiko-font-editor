import {
  createLookupSuggestion,
  makeLigatureRule,
} from 'src/lib/openTypeFeatures/autoFeatureLookup'
import {
  getGlyphSuffix,
  isCommonLigatureName,
  splitLigatureName,
} from 'src/lib/openTypeFeatures/glyphNames'
import type {
  AutoFeatureSuggestion,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData } from 'src/store/types'

const getLigatureFeatureTag = (glyphName: string) => {
  const suffix = getGlyphSuffix(glyphName)
  if (suffix === '.liga') return 'liga'
  if (suffix === '.dlig') return 'dlig'
  if (suffix === '.rlig') return 'rlig'
  if (suffix === '.hlig') return 'hlig'
  if (isCommonLigatureName(glyphName)) return 'liga'
  return 'dlig'
}

export const buildLigatureSuggestions = (
  fontData: FontData,
  state: OpenTypeFeaturesState
): AutoFeatureSuggestion[] => {
  if (!state.autoFeatureConfig.enabled) return []

  const glyphNames = new Set(Object.keys(fontData.glyphs))
  const rulesByFeature = new Map<string, Rule[]>()

  for (const glyph of Object.values(fontData.glyphs)) {
    const components = splitLigatureName(glyph.name)
    if (!components || components.length < 2) continue
    if (!components.every((component) => glyphNames.has(component))) continue

    const featureTag = getLigatureFeatureTag(glyph.name)
    if (
      !state.autoFeatureConfig[featureTag as 'liga' | 'dlig' | 'rlig' | 'hlig']
    ) {
      continue
    }

    const rules = rulesByFeature.get(featureTag) ?? []
    rules.push(
      makeLigatureRule({
        components,
        replacement: glyph.name,
        featureTag,
        reason: `Glyph name "${glyph.name}" looks like a ${featureTag} ligature.`,
      })
    )
    rulesByFeature.set(featureTag, rules)
  }

  return [...rulesByFeature.entries()].map(([featureTag, rules]) =>
    createLookupSuggestion({
      featureTag,
      lookupType: 'ligatureSubst',
      table: 'GSUB',
      rules,
      reason: `Generated ${rules.length} ligature rule${rules.length === 1 ? '' : 's'} from glyph names.`,
      generator: 'glyph-name-ligature',
    })
  )
}
