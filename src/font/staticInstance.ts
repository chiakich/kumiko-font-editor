import { interpolateGlyphLayer } from '@/font/glyphInterpolation'
import {
  getActiveBracketLayerForSource,
  getGlyphMasterLayerForSource,
  locationsMatch,
} from '@/font/designspaceLocation'
import { activeLayer } from '@/domain/glyphLayer'
import type {
  FontAxis,
  FontData,
  FontExportInstance,
  FontSource,
  GlyphData,
  GlyphLayerData,
} from '@/domain'

export const STATIC_INSTANCE_LAYER_ID = 'public.default'

export interface StaticInstanceBakeProblem {
  glyphId: string
  glyphName: string
  message: string
}

export interface StaticInstanceBakeResult {
  glyph: GlyphData
  warnings: StaticInstanceBakeProblem[]
  errors: StaticInstanceBakeProblem[]
}

export interface StaticInstanceBakeListResult {
  glyphs: GlyphData[]
  warnings: StaticInstanceBakeProblem[]
  errors: StaticInstanceBakeProblem[]
}

const cloneStaticLayer = (
  layer: GlyphLayerData,
  layerId: string,
  layerName: string
): GlyphLayerData => ({
  ...structuredClone(layer),
  id: layerId,
  name: layerName,
  type: 'master',
  associatedMasterId: layerId,
})

const bakeGlyphWithLayer = (glyph: GlyphData, layer: GlyphLayerData) => ({
  ...structuredClone(glyph),
  activeLayerId: layer.id,
  layerOrder: [layer.id],
  layers: {
    [layer.id]: layer,
  },
})

const describeCompatibilityProblems = (
  glyph: GlyphData,
  messages: string[]
): StaticInstanceBakeProblem[] =>
  messages.map((message) => ({
    glyphId: glyph.id,
    glyphName: glyph.displayName ?? glyph.name ?? glyph.id,
    message,
  }))

const interpolationMessages = (
  result: ReturnType<typeof interpolateGlyphLayer>
) => [
  ...result.issues.map((issue) => issue.message),
  ...result.modelErrors.map((error) => error.message),
]

const getSourceAtLocation = (
  sources: Record<string, FontSource> | undefined,
  axes: FontAxis[],
  location: Record<string, number>
) =>
  Object.values(sources ?? {}).find((source) =>
    locationsMatch(source.location, location, axes)
  )

const getExactSourceLayer = (input: {
  axes: FontAxis[]
  glyph: GlyphData
  includeBracketLayers?: boolean
  location: Record<string, number>
  sources: Record<string, FontSource> | undefined
}) => {
  const source = getSourceAtLocation(input.sources, input.axes, input.location)
  if (!source) {
    return null
  }

  return (
    (input.includeBracketLayers !== false
      ? getActiveBracketLayerForSource(input.glyph, source.id, input.location)
      : null) ?? getGlyphMasterLayerForSource(input.glyph, source.id)
  )
}

export const bakeGlyphStaticInstance = (input: {
  fontData: Pick<FontData, 'axes' | 'sources'>
  glyph: GlyphData
  instance: Pick<
    FontExportInstance,
    'export' | 'id' | 'location' | 'name' | 'styleName'
  >
  layerId?: string
  includeBracketLayers?: boolean
}): StaticInstanceBakeResult => {
  const layerId = input.layerId ?? STATIC_INSTANCE_LAYER_ID
  const layerName = input.instance.styleName || input.instance.name || layerId
  const hasDesignspace =
    (input.fontData.axes?.axes.length ?? 0) > 0 &&
    Object.keys(input.fontData.sources ?? {}).length > 0
  const axisList = input.fontData.axes?.axes ?? []

  if (!hasDesignspace) {
    const layer = cloneStaticLayer(activeLayer(input.glyph), layerId, layerName)
    return {
      glyph: bakeGlyphWithLayer(input.glyph, layer),
      warnings: [],
      errors: [],
    }
  }

  const exactSourceLayer = getExactSourceLayer({
    axes: axisList,
    glyph: input.glyph,
    includeBracketLayers: input.includeBracketLayers,
    location: input.instance.location,
    sources: input.fontData.sources,
  })
  if (exactSourceLayer) {
    return {
      glyph: bakeGlyphWithLayer(
        input.glyph,
        cloneStaticLayer(exactSourceLayer, layerId, layerName)
      ),
      warnings: [],
      errors: [],
    }
  }

  const result = interpolateGlyphLayer({
    glyph: input.glyph,
    axes: input.fontData.axes,
    sources: input.fontData.sources,
    location: input.instance.location,
    layerId,
    layerName,
    includeBracketLayers: input.includeBracketLayers,
  })

  if (!result.layer) {
    const messages = interpolationMessages(result)
    return {
      glyph: bakeGlyphWithLayer(
        input.glyph,
        cloneStaticLayer(
          result.baseLayer ?? activeLayer(input.glyph),
          layerId,
          layerName
        )
      ),
      warnings: [],
      errors: describeCompatibilityProblems(
        input.glyph,
        messages.length > 0 ? messages : ['Glyph cannot be interpolated.']
      ),
    }
  }

  return {
    glyph: bakeGlyphWithLayer(input.glyph, result.layer),
    warnings: describeCompatibilityProblems(
      input.glyph,
      interpolationMessages(result)
    ),
    errors: [],
  }
}

export const bakeStaticInstanceGlyphs = (input: {
  fontData: Pick<FontData, 'axes' | 'sources'>
  glyphs: GlyphData[]
  instance: FontExportInstance
  includeBracketLayers?: boolean
}): StaticInstanceBakeListResult => {
  const baked = input.glyphs.map((glyph) =>
    bakeGlyphStaticInstance({
      fontData: input.fontData,
      glyph,
      instance: input.instance,
      includeBracketLayers: input.includeBracketLayers,
    })
  )
  return {
    glyphs: baked.map((result) => result.glyph),
    warnings: baked.flatMap((result) => result.warnings),
    errors: baked.flatMap((result) => result.errors),
  }
}

export const formatStaticInstanceBakeError = (
  instance: Pick<FontExportInstance, 'name' | 'styleName'>,
  errors: StaticInstanceBakeProblem[]
) => {
  const instanceName = instance.name || instance.styleName || 'Instance'
  const preview = errors
    .slice(0, 5)
    .map((error) => `${error.glyphName}: ${error.message}`)
    .join('；')
  const suffix = errors.length > 5 ? `；還有 ${errors.length - 5} 個 glyph` : ''
  return `無法匯出 ${instanceName}：${errors.length} 個 glyph 無法插值。${preview}${suffix}`
}
