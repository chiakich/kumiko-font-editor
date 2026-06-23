import { DiscreteVariationModel } from 'src/font/fontra-ported/discrete-variation-model'
import { locationsMatch } from 'src/font/designspaceLocation'
import {
  makeDefaultLocation,
  mapAxesFromUserSpaceToSourceSpace,
  mapForward,
} from 'src/font/fontra-ported/var-model'
import {
  checkGlyphInterpolationCompatibility,
  type GlyphCompatibilityIssue,
} from 'src/font/glyphCompatibility'
import {
  componentMatrixToRefFields,
  getComponentMatrix,
  type ComponentMatrix,
} from 'src/lib/components/componentTransform'
import type {
  FontAxes,
  FontAxis,
  FontSource,
  GlyphAnchor,
  GlyphComponentRef,
  GlyphData,
  GlyphGuideline,
  GlyphLayerData,
  GlyphMetrics,
  PathData,
} from 'src/store/types'

interface SourceLayerEntry {
  sourceId: string
  source: FontSource
  layer: GlyphLayerData | undefined
}

interface InterpolatableLayerValue {
  metrics: GlyphMetrics
  paths: number[][]
  components: ComponentMatrix[]
  anchors: Array<{ x: number; y: number }>
  guidelines: Array<{ x: number; y: number; angle: number }>
}

export interface GlyphInterpolationResult {
  layer: GlyphLayerData | null
  baseLayer: GlyphLayerData | null
  issues: GlyphCompatibilityIssue[]
  modelErrors: Array<{ message: string; type?: string }>
}

export interface InterpolateGlyphLayerOptions {
  glyph: GlyphData
  axes: FontAxes | undefined
  sources: Record<string, FontSource> | undefined
  location: Record<string, number>
  layerId?: string
  layerName?: string
}

const getMasterLayerForSource = (
  glyph: GlyphData,
  sourceId: string
): GlyphLayerData | undefined =>
  Object.values(glyph.layers ?? {}).find(
    (layer) =>
      (layer.type ?? 'master') === 'master' &&
      (layer.associatedMasterId === sourceId || layer.id === sourceId)
  )

const getSourceLayerEntries = (
  glyph: GlyphData,
  sources: Record<string, FontSource> | undefined
): SourceLayerEntry[] =>
  Object.entries(sources ?? {}).map(([sourceId, source]) => ({
    sourceId,
    source,
    layer: getMasterLayerForSource(glyph, sourceId),
  }))

const chooseBaseLayer = (
  entries: SourceLayerEntry[],
  axes: FontAxis[]
): GlyphLayerData | null => {
  const defaultLocation = makeDefaultLocation(axes)
  const defaultEntry = entries.find(
    (entry) =>
      entry.layer &&
      locationsMatch(entry.source.location, defaultLocation, axes)
  )
  return (
    defaultEntry?.layer ?? entries.find((entry) => entry.layer)?.layer ?? null
  )
}

const pathCoordinates = (path: PathData): number[] =>
  path.nodes.flatMap((node) => [node.x, node.y])

const anchorMap = (anchors: GlyphAnchor[]) =>
  new Map(anchors.map((anchor) => [anchor.name, anchor]))

const layerToInterpolatableValue = (
  layer: GlyphLayerData,
  baseLayer: GlyphLayerData
): InterpolatableLayerValue => {
  const anchors = anchorMap(layer.anchors)
  return {
    metrics: { ...layer.metrics },
    paths: layer.paths.map(pathCoordinates),
    components: layer.componentRefs.map((component) => ({
      ...getComponentMatrix(component),
    })),
    anchors: baseLayer.anchors.map((baseAnchor) => {
      const anchor = anchors.get(baseAnchor.name) ?? baseAnchor
      return { x: anchor.x, y: anchor.y }
    }),
    guidelines: layer.guidelines.map((guide) => ({
      x: guide.x,
      y: guide.y,
      angle: guide.angle,
    })),
  }
}

const applyCoordinatesToPath = (path: PathData, coordinates: number[]) => ({
  ...path,
  nodes: path.nodes.map((node, index) => ({
    ...node,
    x: coordinates[index * 2],
    y: coordinates[index * 2 + 1],
  })),
})

const applyComponentMatrix = (
  component: GlyphComponentRef,
  matrix: ComponentMatrix
): GlyphComponentRef => ({
  ...component,
  ...componentMatrixToRefFields(matrix),
  transform: { ...matrix },
})

const applyAnchorLocation = (
  anchor: GlyphAnchor,
  location: { x: number; y: number }
): GlyphAnchor => ({
  ...anchor,
  x: location.x,
  y: location.y,
})

const applyGuidelineLocation = (
  guideline: GlyphGuideline,
  location: { x: number; y: number; angle: number }
): GlyphGuideline => ({
  ...guideline,
  x: location.x,
  y: location.y,
  angle: location.angle,
})

const valueToLayer = (
  value: InterpolatableLayerValue,
  baseLayer: GlyphLayerData,
  layerId: string,
  layerName: string
): GlyphLayerData => ({
  ...baseLayer,
  id: layerId,
  name: layerName,
  associatedMasterId: null,
  paths: baseLayer.paths.map((path, index) =>
    applyCoordinatesToPath(path, value.paths[index])
  ),
  componentRefs: baseLayer.componentRefs.map((component, index) =>
    applyComponentMatrix(component, value.components[index])
  ),
  anchors: baseLayer.anchors.map((anchor, index) =>
    applyAnchorLocation(anchor, value.anchors[index])
  ),
  guidelines: baseLayer.guidelines.map((guideline, index) =>
    applyGuidelineLocation(guideline, value.guidelines[index])
  ),
  metrics: { ...value.metrics },
})

const normalizeModelError = (
  error: unknown
): { message: string; type?: string } => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return {
      message: error.message,
      type:
        'type' in error && typeof error.type === 'string'
          ? error.type
          : undefined,
    }
  }
  return { message: String(error) }
}

export const interpolateGlyphLayer = ({
  glyph,
  axes,
  sources,
  location,
  layerId = `${glyph.id}:interpolated`,
  layerName = 'Interpolated',
}: InterpolateGlyphLayerOptions): GlyphInterpolationResult => {
  const axisList = axes?.axes ?? []
  const entries = getSourceLayerEntries(glyph, sources)
  const baseLayer = chooseBaseLayer(entries, axisList)
  const layers = entries.map((entry) => entry.layer)
  const compatibility = checkGlyphInterpolationCompatibility(layers)

  if (!baseLayer || !compatibility.compatible) {
    return {
      layer: null,
      baseLayer,
      issues: compatibility.issues,
      modelErrors: [],
    }
  }

  try {
    const modelAxes = mapAxesFromUserSpaceToSourceSpace(axisList)
    const model = new DiscreteVariationModel(
      entries.map((entry) => mapForward(entry.source.location, axisList)),
      modelAxes
    )
    const sourceValues = entries.map((entry) =>
      entry.layer
        ? layerToInterpolatableValue(entry.layer, baseLayer)
        : undefined
    )
    const { subModel, subValues } = model.getSubModel(sourceValues)
    const deltas = subModel.getDeltas(subValues)
    const result = subModel.interpolateFromDeltas(
      mapForward(location, axisList),
      deltas
    )
    const instance = result.instance as InterpolatableLayerValue
    return {
      layer: valueToLayer(instance, baseLayer, layerId, layerName),
      baseLayer,
      issues: compatibility.issues,
      modelErrors: (result.errors ?? []).map(normalizeModelError),
    }
  } catch (error) {
    return {
      layer: null,
      baseLayer,
      issues: compatibility.issues,
      modelErrors: [normalizeModelError(error)],
    }
  }
}
