import type { GlyphData, PathData, PathNode, NodeType } from 'src/store/types'

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
    return node?.type
  }

  if (node.type === 'smooth' && isPathEndpointNode(path, node.id)) {
    return 'corner'
  }

  return node.type
}

export const findPath = (glyph: GlyphData, pathId: string) =>
  glyph.paths.find((path) => path.id === pathId)

export const findNode = (path: PathData | undefined, nodeId: string) =>
  path?.nodes.find((node) => node.id === nodeId)

export const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

export const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t

export const getGlyphXBounds = (glyph: GlyphData | undefined) => {
  const allNodes = glyph?.paths.flatMap((path) => path.nodes) ?? []
  if (allNodes.length === 0) {
    return null
  }

  return {
    xMin: Math.min(...allNodes.map((node) => node.x)),
    xMax: Math.max(...allNodes.map((node) => node.x)),
  }
}

export const translateGlyphHorizontally = (
  glyph: GlyphData | undefined,
  deltaX: number
) => {
  if (!glyph || deltaX === 0) {
    return
  }

  for (const path of glyph.paths) {
    for (const node of path.nodes) {
      node.x = Math.round(node.x + deltaX)
    }
  }

  for (const componentRef of glyph.componentRefs) {
    componentRef.x = Math.round(componentRef.x + deltaX)
  }

  for (const anchor of glyph.anchors ?? []) {
    anchor.x = Math.round(anchor.x + deltaX)
  }

  for (const guideline of glyph.guidelines ?? []) {
    guideline.x = Math.round(guideline.x + deltaX)
  }
}

export const recomputeGlyphSidebearings = (glyph: GlyphData | undefined) => {
  if (!glyph) {
    return
  }

  const bounds = getGlyphXBounds(glyph)
  if (!bounds) {
    return
  }

  glyph.metrics.lsb = Math.round(bounds.xMin)
  glyph.metrics.rsb = Math.round(glyph.metrics.width - bounds.xMax)
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
