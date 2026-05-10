import {
  createLookupSuggestion,
  makeSingleSubstitutionRule,
} from 'src/lib/openTypeFeatures/autoFeatureLookup'
import {
  getGlyphBaseName,
  getGlyphSuffix,
  isLowercaseGlyph,
  isUppercaseGlyph,
} from 'src/lib/openTypeFeatures/glyphNames'
import type {
  AutoFeatureSuggestion,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, GlyphData } from 'src/store/types'

const featureForSuffix = (suffix: string) => {
  if (/^\.ss\d\d$/.test(suffix)) return suffix.slice(1)
  if (suffix === '.salt') return 'salt'
  if (suffix === '.osf') return 'onum'
  if (suffix === '.lf') return 'lnum'
  if (suffix === '.tf') return 'tnum'
  if (suffix === '.pnum') return 'pnum'
  if (suffix === '.sups') return 'sups'
  if (suffix === '.subs') return 'subs'
  if (suffix === '.ordn') return 'ordn'
  return null
}

const smallCapsFeatureForGlyph = (
  sourceGlyph: GlyphData | undefined,
  suffix: string
) => {
  if (suffix !== '.sc' || !sourceGlyph) return null
  if (isLowercaseGlyph(sourceGlyph)) return 'smcp'
  if (isUppercaseGlyph(sourceGlyph)) return 'c2sc'
  return null
}

const acceptsFeature = (state: OpenTypeFeaturesState, featureTag: string) => {
  if (/^ss\d\d$/.test(featureTag)) {
    return state.autoFeatureConfig.stylisticSets
  }
  return Boolean(
    state.autoFeatureConfig[featureTag as keyof typeof state.autoFeatureConfig]
  )
}

export const buildSuffixSuggestions = (
  fontData: FontData,
  state: OpenTypeFeaturesState
): AutoFeatureSuggestion[] => {
  if (!state.autoFeatureConfig.enabled) return []

  const rulesByFeature = new Map<string, Rule[]>()

  for (const glyph of Object.values(fontData.glyphs)) {
    const suffix = getGlyphSuffix(glyph.name)
    if (!suffix) continue
    const sourceName = getGlyphBaseName(glyph.name)
    const sourceGlyph = fontData.glyphs[sourceName]
    if (!sourceGlyph) continue

    const featureTag =
      smallCapsFeatureForGlyph(sourceGlyph, suffix) ?? featureForSuffix(suffix)
    if (!featureTag || !acceptsFeature(state, featureTag)) continue

    const rules = rulesByFeature.get(featureTag) ?? []
    rules.push(
      makeSingleSubstitutionRule({
        source: sourceName,
        replacement: glyph.name,
        featureTag,
        generator:
          featureTag === 'smcp' || featureTag === 'c2sc'
            ? 'small-caps'
            : /^ss\d\d$/.test(featureTag)
              ? 'glyph-suffix'
              : 'numerals',
        reason: `Glyph suffix "${suffix}" maps "${sourceName}" to "${glyph.name}".`,
      })
    )
    rulesByFeature.set(featureTag, rules)
  }

  return [...rulesByFeature.entries()].map(([featureTag, rules]) =>
    createLookupSuggestion({
      featureTag,
      lookupType: 'singleSubst',
      table: 'GSUB',
      rules,
      reason: `Generated ${rules.length} ${featureTag} substitution rule${rules.length === 1 ? '' : 's'} from glyph suffixes.`,
      generator:
        featureTag === 'smcp' || featureTag === 'c2sc'
          ? 'small-caps'
          : /^ss\d\d$/.test(featureTag)
            ? 'glyph-suffix'
            : 'numerals',
    })
  )
}
