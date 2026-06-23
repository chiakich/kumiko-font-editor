import type { FontAxis, FontData, GlyphData } from 'src/store/types'

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
