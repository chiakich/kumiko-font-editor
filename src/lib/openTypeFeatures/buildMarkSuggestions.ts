import { makeRuleId } from 'src/lib/openTypeFeatures/ids'
import { createLookupSuggestion } from 'src/lib/openTypeFeatures/autoFeatureLookup'
import type {
  AnchorPoint,
  AutoFeatureSuggestion,
  MarkClass,
  MarkToBaseRule,
  MarkToMarkRule,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, GlyphAnchor, GlyphData } from 'src/store/types'

interface NamedAnchor {
  glyph: string
  anchor: AnchorPoint
}

const MARK_POSITIONING_SERIALIZER_NOTE =
  'Mark positioning IR is generated, but FEA serialization for mark positioning is still staged.'

const anchorPoint = (anchor: GlyphAnchor): AnchorPoint => ({
  x: anchor.x,
  y: anchor.y,
})

const getGlyphAnchors = (glyph: GlyphData): GlyphAnchor[] =>
  glyph.anchors ?? glyph.layers?.[glyph.activeLayerId ?? '']?.anchors ?? []

const collectAnchors = (fontData: FontData) => {
  const baseAnchors = new Map<string, NamedAnchor[]>()
  const markAnchors = new Map<string, NamedAnchor[]>()

  for (const glyph of Object.values(fontData.glyphs)) {
    for (const anchor of getGlyphAnchors(glyph)) {
      if (anchor.name.startsWith('_')) {
        const name = anchor.name.slice(1)
        markAnchors.set(name, [
          ...(markAnchors.get(name) ?? []),
          { glyph: glyph.name, anchor: anchorPoint(anchor) },
        ])
      } else {
        baseAnchors.set(anchor.name, [
          ...(baseAnchors.get(anchor.name) ?? []),
          { glyph: glyph.name, anchor: anchorPoint(anchor) },
        ])
      }
    }
  }

  return { baseAnchors, markAnchors }
}

const makeMarkClass = (
  anchorName: string,
  marks: NamedAnchor[]
): MarkClass => ({
  id: `markClass_${anchorName}`,
  name: `@MC_${anchorName}`,
  marks: marks.map((mark) => ({
    glyph: mark.glyph,
    anchor: mark.anchor,
  })),
})

const makeMarkToBaseRules = (
  anchorName: string,
  bases: NamedAnchor[],
  markClass: MarkClass
): MarkToBaseRule[] =>
  bases.map((base) => ({
    id: makeRuleId(['mark', anchorName, base.glyph, markClass.id]),
    kind: 'markToBase',
    baseGlyphs: { kind: 'glyph', glyph: base.glyph },
    anchors: { [markClass.id]: base.anchor },
    meta: {
      origin: 'auto',
      generator: 'anchors',
      confidence: 'high',
      reason: `Anchor "${anchorName}" on "${base.glyph}" matches mark class "${markClass.name}". ${MARK_POSITIONING_SERIALIZER_NOTE}`,
    },
  }))

const makeMarkToMarkRules = (
  anchorName: string,
  baseMarks: NamedAnchor[],
  markClass: MarkClass
): MarkToMarkRule[] =>
  baseMarks.map((baseMark) => ({
    id: makeRuleId(['mkmk', anchorName, baseMark.glyph, markClass.id]),
    kind: 'markToMark',
    baseMarks: { kind: 'glyph', glyph: baseMark.glyph },
    anchors: { [markClass.id]: baseMark.anchor },
    meta: {
      origin: 'auto',
      generator: 'anchors',
      confidence: 'medium',
      reason: `Mark glyph "${baseMark.glyph}" has anchor "${anchorName}" for mark-to-mark positioning. ${MARK_POSITIONING_SERIALIZER_NOTE}`,
    },
  }))

export const buildMarkSuggestions = (
  fontData: FontData,
  state: OpenTypeFeaturesState
): AutoFeatureSuggestion[] => {
  const suggestions: AutoFeatureSuggestion[] = []
  const { baseAnchors, markAnchors } = collectAnchors(fontData)

  for (const [anchorName, marks] of markAnchors.entries()) {
    if (marks.length === 0) continue
    const markClass = makeMarkClass(anchorName, marks)

    if (state.autoFeatureConfig.mark) {
      const bases = baseAnchors.get(anchorName) ?? []
      const rules = makeMarkToBaseRules(anchorName, bases, markClass)
      if (rules.length > 0) {
        suggestions.push({
          ...createLookupSuggestion({
            featureTag: 'mark',
            lookupType: 'markToBasePos',
            table: 'GPOS',
            rules,
            reason: `Generated ${rules.length} mark positioning rule${rules.length === 1 ? '' : 's'} from "${anchorName}" and "_${anchorName}" anchors. ${MARK_POSITIONING_SERIALIZER_NOTE}`,
            generator: 'anchors',
          }),
          markClasses: [markClass],
        })
      }
    }

    if (state.autoFeatureConfig.mkmk) {
      const baseMarks = (baseAnchors.get(anchorName) ?? []).filter((base) =>
        marks.some((mark) => mark.glyph === base.glyph)
      )
      const rules = makeMarkToMarkRules(anchorName, baseMarks, markClass)
      if (rules.length > 0) {
        suggestions.push({
          ...createLookupSuggestion({
            featureTag: 'mkmk',
            lookupType: 'markToMarkPos',
            table: 'GPOS',
            rules,
            reason: `Generated ${rules.length} mark-to-mark rule${rules.length === 1 ? '' : 's'} from mark glyphs with "${anchorName}" and "_${anchorName}" anchors. ${MARK_POSITIONING_SERIALIZER_NOTE}`,
            generator: 'anchors',
          }),
          markClasses: [markClass],
        })
      }
    }
  }

  return suggestions
}
