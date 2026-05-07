import { getEffectiveNodeType, type GlyphData } from 'src/store'

export interface GlyphSelectionNodeEntry {
  key: string
  pathId: string
  nodeId: string
  x: number
  y: number
  type: GlyphData['paths'][number]['nodes'][number]['type']
  effectiveType: GlyphData['paths'][number]['nodes'][number]['type']
}

export const buildGlyphSelectionNodeEntries = (
  glyph: GlyphData
): GlyphSelectionNodeEntry[] =>
  glyph.paths.flatMap((path) =>
    path.nodes.map((node) => ({
      key: `${path.id}:${node.id}`,
      pathId: path.id,
      nodeId: node.id,
      x: node.x,
      y: node.y,
      type: node.type,
      effectiveType: getEffectiveNodeType(path, node) ?? node.type,
    }))
  )

export const getClosestNodeKey = (
  nodes: GlyphSelectionNodeEntry[],
  point: { x: number; y: number },
  maxDistance: number
) => {
  let bestKey: string | null = null
  let bestDistance = Infinity

  for (const node of nodes) {
    const dx = node.x - point.x
    const dy = node.y - point.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance
      bestKey = node.key
    }
  }

  return bestKey
}

export const getNodeKeysInRect = (
  nodes: GlyphSelectionNodeEntry[],
  rect: { xMin: number; yMin: number; xMax: number; yMax: number }
) =>
  nodes
    .filter(
      (node) =>
        node.x >= rect.xMin &&
        node.x <= rect.xMax &&
        node.y >= rect.yMin &&
        node.y <= rect.yMax
    )
    .map((node) => node.key)

export const getContourNodeKeys = (glyph: GlyphData, pathId: string) => {
  const path = glyph.paths.find((candidate) => candidate.id === pathId)
  if (!path) {
    return []
  }

  return path.nodes.map((node) => `${path.id}:${node.id}`)
}

export const pointSelectionKey = (index: number) => `point/${index}`

export const buildPointSelection = (indices: Iterable<number>) =>
  new Set(Array.from(indices, (index) => pointSelectionKey(index)))

export const parsePointSelection = (selection: Set<string>) => {
  const indices: number[] = []
  for (const item of selection) {
    const match = item.match(/^point\/(\d+)$/)
    if (match) {
      indices.push(Number.parseInt(match[1], 10))
    }
  }
  return indices
}

export const getIndexedPointSelectionInRect = (
  points: Iterable<{ index: number; x: number; y: number }>,
  rect: { xMin: number; yMin: number; xMax: number; yMax: number }
) =>
  buildPointSelection(
    Array.from(points)
      .filter(
        (point) =>
          point.x >= rect.xMin &&
          point.x <= rect.xMax &&
          point.y >= rect.yMin &&
          point.y <= rect.yMax
      )
      .map((point) => point.index)
  )

export const getOnCurveContourPointSelection = (
  path: {
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
    getPoint?(index: number): { type?: string } | undefined
  },
  contourIndex: number
) => {
  if (!path.contourInfo?.[contourIndex]) {
    return new Set<string>()
  }

  const startPoint =
    contourIndex === 0 ? 0 : path.contourInfo[contourIndex - 1].endPoint + 1
  const endPoint = path.contourInfo[contourIndex].endPoint
  const indices: number[] = []

  for (let index = startPoint; index <= endPoint; index += 1) {
    const point = path.getPoint?.(index)
    if (point?.type === 'onCurve') {
      indices.push(index)
    }
  }

  return buildPointSelection(indices)
}
