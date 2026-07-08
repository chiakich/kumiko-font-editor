import type { FontData, GlyphMetrics, PathData } from 'src/store'
import type {
  GlyphClass,
  GlyphSelector,
  OpenTypeFeaturesState,
  PairPositioningRule,
} from 'src/lib/openTypeFeatures'
import { resolveKerningPair } from 'src/lib/kerning/resolveKerning'

export function getTextKerningValue(
  fontData: FontData,
  leftGlyphId: string | null,
  rightGlyphId: string | null
) {
  if (!leftGlyphId || !rightGlyphId) return 0

  // Canonical project kerning wins over derived GPOS rules so edits in the
  // Kerning panel preview immediately, following UFO pair priority.
  const resolved = resolveKerningPair(fontData, leftGlyphId, rightGlyphId)
  if (resolved.priority !== 'none') {
    return resolved.value
  }

  const featureKerning = getFeatureKerningValue(
    fontData.openTypeFeatures,
    leftGlyphId,
    rightGlyphId
  )
  if (featureKerning !== null) {
    return featureKerning
  }

  return 0
}

export function getGlyphInkBounds(glyph: {
  paths: PathData[]
  metrics: GlyphMetrics
}) {
  const xs = glyph.paths.flatMap((path) => path.nodes.map((node) => node.x))
  if (xs.length === 0) {
    return { xMin: 0, xMax: glyph.metrics.width }
  }

  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
  }
}

function getFeatureKerningValue(
  state: OpenTypeFeaturesState | undefined,
  leftGlyphId: string,
  rightGlyphId: string
) {
  if (!state) return null

  const classById = new Map(state.glyphClasses.map((item) => [item.id, item]))
  const lookupById = new Map(state.lookups.map((item) => [item.id, item]))
  const kernLookupIds = state.features
    .filter((feature) => feature.isActive && feature.tag === 'kern')
    .flatMap((feature) => feature.entries.flatMap((entry) => entry.lookupIds))

  let value: number | null = null
  for (const lookupId of kernLookupIds) {
    const lookup = lookupById.get(lookupId)
    if (lookup?.table !== 'GPOS' || lookup.lookupType !== 'pairPos') {
      continue
    }

    for (const rule of lookup.rules) {
      if (
        rule.kind === 'pairPositioning' &&
        matchesPairRule(rule, leftGlyphId, rightGlyphId, classById)
      ) {
        value = rule.firstValue?.xAdvance ?? 0
      }
    }
  }

  return value
}

function matchesPairRule(
  rule: PairPositioningRule,
  leftGlyphId: string,
  rightGlyphId: string,
  classById: Map<string, GlyphClass>
) {
  return (
    selectorContainsGlyph(rule.left, leftGlyphId, classById) &&
    selectorContainsGlyph(rule.right, rightGlyphId, classById)
  )
}

function selectorContainsGlyph(
  selector: GlyphSelector,
  glyphId: string,
  classById: Map<string, GlyphClass>
) {
  if (selector.kind === 'glyph') {
    return selector.glyph === glyphId
  }

  const glyphClass = classById.get(selector.classId)
  return glyphClass?.glyphs.includes(glyphId) ?? false
}
