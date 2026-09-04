import { isValidGlyphName } from '@/lib/openTypeFeatures/validationNames'
import { getRuleGlyphReferences } from '@/lib/openTypeFeatures/ruleReferences'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures/types'
import type { FontData, GlyphData, GlyphLayerData } from '@/domain'
import { getGlyphLayer } from '@/domain/glyphLayer'
import type { BehaviorRuleReferenceTarget } from '@/lib/openTypeFeatures/behaviorTypes'
import { isAlternateSubstitutionRule } from '@/lib/openTypeFeatures/behaviors/behaviorShared'

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
  const paths: GlyphLayerData['paths'] = []
  const componentRefs = componentGlyphIds.map((componentId, index) => {
    const sourceGlyph = fontData.glyphs[componentId]
    const sourceLayer = getGlyphLayer(sourceGlyph, null)
    const ref = {
      id: `component_${index}_${componentId.replace(/[^A-Za-z0-9_.-]+/g, '_')}`,
      glyphId: componentId,
      x: cursorX,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }
    for (const path of sourceLayer?.paths ?? []) {
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
    cursorX += sourceLayer?.metrics.width ?? 0
    return ref
  })

  const firstLayer = Object.values(fontData.glyphs)
    .map((glyph) => getGlyphLayer(glyph, null))
    .find(Boolean)
  const width =
    cursorX || firstLayer?.metrics.width || fontData.unitsPerEm || 1000
  const layerId = firstLayer?.id ?? 'public.default'

  return {
    id: glyphId,
    name: glyphId,
    unicodes: [],
    export: true,
    activeLayerId: layerId,
    layerOrder: [layerId],
    layers: {
      [layerId]: {
        id: layerId,
        name: layerId,
        type: 'master',
        associatedMasterId: layerId,
        paths,
        componentRefs: paths.length === 0 ? componentRefs : [],
        anchors: [],
        guidelines: [],
        metrics: { width, lsb: 0, rsb: width },
      },
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
  const source = getGlyphLayer(sourceGlyph, null)
  if (!sourceGlyph || !source) return null

  const layerId = source.id
  return {
    ...sourceGlyph,
    id: glyphId,
    name: glyphId,
    unicodes: [],
    activeLayerId: layerId,
    layerOrder: [layerId],
    layers: {
      [layerId]: {
        id: layerId,
        name: layerId,
        type: 'master',
        associatedMasterId: source.associatedMasterId ?? layerId,
        paths: source.paths.map((path) => ({
          ...path,
          id: `${glyphId}_${path.id}`,
          nodes: path.nodes.map((node) => ({
            ...node,
            id: `${glyphId}_${node.id}`,
          })),
        })),
        componentRefs: source.componentRefs.map((componentRef) => ({
          ...componentRef,
          id: `${glyphId}_${componentRef.id}`,
        })),
        anchors: (source.anchors ?? []).map((anchor) => ({
          ...anchor,
          id: `${glyphId}_${anchor.id}`,
        })),
        guidelines: (source.guidelines ?? []).map((guideline) => ({
          ...guideline,
          id: `${glyphId}_${guideline.id}`,
        })),
        metrics: source.metrics,
      },
    },
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
