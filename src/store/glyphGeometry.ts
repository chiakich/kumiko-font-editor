import type {
  GlyphData,
  GlyphLayerData,
  OnCurveNodeType,
  PathData,
  PathNode,
  PathSegmentType,
} from 'src/store/types'
import { activeLayer } from 'src/store/glyphLayer'

export const createOnCurveNode = (
  id: string,
  x: number,
  y: number,
  segmentType: PathSegmentType = 'line',
  smooth = false
): PathNode => ({
  id,
  x,
  y,
  kind: 'oncurve',
  segmentType,
  smooth,
})

export const createOffCurveNode = (
  id: string,
  x: number,
  y: number
): PathNode => ({
  id,
  x,
  y,
  kind: 'offcurve',
})

export const isOnCurveNode = (node: PathNode | undefined): node is PathNode =>
  node?.kind === 'oncurve'

export const isOffCurveNode = (node: PathNode | undefined): node is PathNode =>
  node?.kind === 'offcurve'

export const getNodeType = (
  node: PathNode | undefined
): OnCurveNodeType | undefined =>
  isOnCurveNode(node) ? (node.smooth ? 'smooth' : 'corner') : undefined

export const setNodeType = (node: PathNode, type: OnCurveNodeType) => {
  node.kind = 'oncurve'
  node.smooth = type === 'smooth'
}

export const getNodeSegmentType = (
  node: PathNode | undefined
): PathSegmentType | undefined =>
  isOnCurveNode(node) ? (node.segmentType ?? 'line') : undefined

export const setNodeSegmentType = (
  node: PathNode,
  segmentType: PathSegmentType
) => {
  node.kind = 'oncurve'
  node.segmentType = segmentType
}

export const isPathEndpointNode = (path: PathData, nodeId: string) => {
  if (path.closed || path.nodes.length === 0) {
    return false
  }

  return (
    path.nodes[0]?.id === nodeId ||
    path.nodes[path.nodes.length - 1]?.id === nodeId
  )
}

export const getEffectiveNodeType = (
  path: PathData | undefined,
  node: PathNode | undefined
): NodeType | undefined => {
  if (!path || !node) {
    return getNodeType(node)
  }

  if (node.smooth && isPathEndpointNode(path, node.id)) {
    return 'corner'
  }

  return getNodeType(node)
}

export const findPath = (layer: GlyphLayerData, pathId: string) =>
  layer.paths.find((path) => path.id === pathId)

export const findNode = (path: PathData | undefined, nodeId: string) =>
  path?.nodes.find((node) => node.id === nodeId)

export const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

export const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t

export const getGlyphXBounds = (layer: GlyphLayerData | undefined) => {
  const allNodes = layer?.paths.flatMap((path) => path.nodes) ?? []
  if (allNodes.length === 0) {
    return null
  }

  return {
    xMin: Math.min(...allNodes.map((node) => node.x)),
    xMax: Math.max(...allNodes.map((node) => node.x)),
  }
}

export const translateGlyphHorizontally = (
  layer: GlyphLayerData | undefined,
  deltaX: number
) => {
  if (!layer || deltaX === 0) {
    return
  }

  for (const path of layer.paths) {
    for (const node of path.nodes) {
      node.x = Math.round(node.x + deltaX)
    }
  }

  for (const componentRef of layer.componentRefs) {
    componentRef.x = Math.round(componentRef.x + deltaX)
  }

  for (const anchor of layer.anchors ?? []) {
    anchor.x = Math.round(anchor.x + deltaX)
  }

  for (const guideline of layer.guidelines ?? []) {
    guideline.x = Math.round(guideline.x + deltaX)
  }
}

export const recomputeGlyphSidebearings = (
  layer: GlyphLayerData | undefined
) => {
  if (!layer) {
    return
  }

  const bounds = getGlyphXBounds(layer)
  if (!bounds) {
    return
  }

  layer.metrics.lsb = Math.round(bounds.xMin)
  layer.metrics.rsb = Math.round(layer.metrics.width - bounds.xMax)
}

export const orientOpenPathNodesForConnection = (
  path: PathData,
  endpointNodeId: string,
  placeEndpointAt: 'start' | 'end'
) => {
  const nodes = [...path.nodes]
  if (nodes.length === 0) {
    return nodes
  }

  const isStart = nodes[0]?.id === endpointNodeId
  const isEnd = nodes[nodes.length - 1]?.id === endpointNodeId
  if (!isStart && !isEnd) {
    return nodes
  }

  if (
    (placeEndpointAt === 'end' && isEnd) ||
    (placeEndpointAt === 'start' && isStart)
  ) {
    return nodes
  }

  return [...nodes].reverse()
}

export const wouldCreateComponentCycle = (
  glyphMap: Record<string, GlyphData>,
  hostGlyphId: string,
  componentGlyphId: string,
  depth = 0
): boolean => {
  if (hostGlyphId === componentGlyphId || depth > 16) {
    return true
  }

  const componentGlyph = glyphMap[componentGlyphId]
  if (!componentGlyph) {
    return false
  }

  return activeLayer(componentGlyph).componentRefs.some((componentRef) =>
    wouldCreateComponentCycle(
      glyphMap,
      hostGlyphId,
      componentRef.glyphId,
      depth + 1
    )
  )
}
