import type {
  FontAxis,
  FontData,
  GlyphData,
  GlyphLayerData,
} from 'src/store/types'

const axisValue = (location: Record<string, number>, axis: FontAxis) =>
  location[axis.name] ?? axis.defaultValue

export const locationsMatch = (
  a: Record<string, number>,
  b: Record<string, number>,
  axes: FontAxis[],
  tolerance = 1e-6
) =>
  axes.every(
    (axis) => Math.abs(axisValue(a, axis) - axisValue(b, axis)) <= tolerance
  )

export const findSourceIdAtLocation = (
  fontData: FontData | null | undefined,
  location: Record<string, number>
): string | null => {
  const axes = fontData?.axes?.axes ?? []
  const sources = Object.values(fontData?.sources ?? {})
  if (axes.length === 0 || sources.length === 0) {
    return null
  }
  return (
    sources.find((source) => locationsMatch(source.location, location, axes))
      ?.id ?? null
  )
}

export const getGlyphMasterLayerForSource = (
  glyph: GlyphData | null | undefined,
  sourceId: string | null | undefined
) => {
  if (!glyph || !sourceId) {
    return null
  }
  return (
    Object.values(glyph.layers ?? {}).find(
      (layer) =>
        (layer.type ?? 'master') === 'master' &&
        (layer.associatedMasterId === sourceId || layer.id === sourceId)
    ) ?? null
  )
}

export const getOrderedGlyphLayers = (glyph: GlyphData) => {
  const layers = glyph.layers ?? {}
  const seen = new Set<string>()
  const ordered: GlyphLayerData[] = []
  for (const layerId of glyph.layerOrder ?? []) {
    const layer = layers[layerId]
    if (layer) {
      seen.add(layerId)
      ordered.push(layer)
    }
  }
  for (const [layerId, layer] of Object.entries(layers)) {
    if (!seen.has(layerId)) {
      ordered.push(layer)
    }
  }
  return ordered
}

export const bracketLayerApplies = (
  layer: GlyphLayerData,
  location: Record<string, number>
) => {
  const rules = layer.bracketAxisRules
  if (!rules || Object.keys(rules).length === 0) {
    return false
  }

  return Object.entries(rules).every(([axisName, rule]) => {
    const value = location[axisName]
    if (value === undefined) {
      return false
    }
    return (
      (rule.min === undefined || value >= rule.min) &&
      (rule.max === undefined || value <= rule.max)
    )
  })
}

export const getActiveBracketLayerForSource = (
  glyph: GlyphData | null | undefined,
  sourceId: string | null | undefined,
  location: Record<string, number>
): GlyphLayerData | null => {
  if (!glyph || !sourceId) {
    return null
  }
  return (
    getOrderedGlyphLayers(glyph)
      .filter(
        (layer) =>
          layer.type === 'bracket' &&
          layer.associatedMasterId === sourceId &&
          bracketLayerApplies(layer, location)
      )
      .at(-1) ?? null
  )
}

export const isInterpolatedGlyphLocation = (
  fontData: FontData | null | undefined,
  glyph: GlyphData | null | undefined,
  location: Record<string, number>
) => {
  const axes = fontData?.axes?.axes ?? []
  const sources = Object.values(fontData?.sources ?? {})
  if (axes.length === 0 || sources.length <= 1) {
    return false
  }

  const sourceId = findSourceIdAtLocation(fontData, location)
  if (!sourceId) {
    return true
  }

  if (getActiveBracketLayerForSource(glyph, sourceId, location)) {
    return true
  }

  return glyph ? !getGlyphMasterLayerForSource(glyph, sourceId) : false
}

export const isInterpolatedEditLocation = (
  fontData: FontData | null | undefined,
  location: Record<string, number>
) => {
  const axes = fontData?.axes?.axes ?? []
  const sources = Object.values(fontData?.sources ?? {})
  if (axes.length === 0 || sources.length <= 1) {
    return false
  }
  return !findSourceIdAtLocation(fontData, location)
}
