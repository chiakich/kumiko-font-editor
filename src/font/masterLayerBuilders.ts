import { offsetGlyphPaths } from 'src/lib/outlineOffset'
import type { FontSource, GlyphLayerData } from 'src/store/types'

const masterLayerBase = (source: FontSource) => ({
  id: source.id,
  name: source.name,
  type: 'master' as const,
  associatedMasterId: source.id,
})

// An empty master layer: no outline, keeping the base master's advance width so
// spacing stays sensible until the glyph is drawn.
export const buildEmptyMasterLayer = (
  source: FontSource,
  base?: GlyphLayerData
): GlyphLayerData => ({
  ...masterLayerBase(source),
  paths: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: base ? { ...base.metrics } : { lsb: 0, rsb: 0, width: 0 },
})

// A copy of a base master's layer with the outline offset by `distance` font
// units (positive emboldens). cleanup is off so node ids stay stable and the new
// master remains interpolation-compatible with the base.
export const buildCopiedMasterLayer = (
  source: FontSource,
  base: GlyphLayerData,
  distance: number
): GlyphLayerData => {
  const { paths } = offsetGlyphPaths(structuredClone(base.paths), distance, {
    cleanup: false,
  })
  return {
    ...masterLayerBase(source),
    paths,
    componentRefs: structuredClone(base.componentRefs ?? []),
    anchors: structuredClone(base.anchors ?? []),
    guidelines: [],
    metrics: { ...base.metrics },
  }
}
