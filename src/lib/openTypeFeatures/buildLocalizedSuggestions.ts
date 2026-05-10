import {
  createLookupSuggestion,
  makeSingleSubstitutionRule,
} from 'src/lib/openTypeFeatures/autoFeatureLookup'
import {
  getGlyphBaseName,
  getLocalizedLanguage,
} from 'src/lib/openTypeFeatures/glyphNames'
import type {
  AutoFeatureSuggestion,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData } from 'src/store/types'

export const buildLocalizedSuggestions = (
  fontData: FontData,
  state: OpenTypeFeaturesState
): AutoFeatureSuggestion[] => {
  if (!state.autoFeatureConfig.enabled || !state.autoFeatureConfig.locl) {
    return []
  }

  const rulesByLanguage = new Map<string, Rule[]>()
  for (const glyph of Object.values(fontData.glyphs)) {
    const language = getLocalizedLanguage(glyph.name)
    if (!language) continue
    const sourceName = getGlyphBaseName(glyph.name)
    if (!fontData.glyphs[sourceName]) continue
    const rules = rulesByLanguage.get(language) ?? []
    rules.push(
      makeSingleSubstitutionRule({
        source: sourceName,
        replacement: glyph.name,
        featureTag: 'locl',
        generator: 'localized-glyph',
        reason: `Glyph suffix maps "${sourceName}" to ${language.trim()} localized form "${glyph.name}".`,
      })
    )
    rulesByLanguage.set(language, rules)
  }

  const rules = [...rulesByLanguage.values()].flat()
  if (rules.length === 0) return []

  const suggestion = createLookupSuggestion({
    featureTag: 'locl',
    lookupType: 'singleSubst',
    table: 'GSUB',
    rules,
    reason: `Generated ${rules.length} localized substitution rule${rules.length === 1 ? '' : 's'} from .locl suffixes.`,
    generator: 'localized-glyph',
  })

  const entries = [...rulesByLanguage.keys()].map((language) => ({
    id: `entry_locl_latn_${language.trim()}`,
    script: 'latn',
    language,
    lookupIds: [suggestion.lookup.id],
  }))

  return [
    {
      ...suggestion,
      lookup: {
        ...suggestion.lookup,
        meta: {
          languageEntries: entries,
        },
      } as LookupRecord,
    },
  ]
}
