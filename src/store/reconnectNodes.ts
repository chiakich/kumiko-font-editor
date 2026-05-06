import type { GlyphData, PathData, PathNode } from './types'
import { generateId } from './glyphGeometry'

/** Fixed nudge distance (font units) to avoid overlapping closing segments. */
const EXTENSION_DISTANCE = 2

export type ReconnectEndpoint = {
  pathId: string
  nodeId: string
  node: PathNode
  endpoint: 'start' | 'end'
  chainId?: number
  originalNodeId?: string
}

export const pairNearestEndpoints = (
  endpoints: ReconnectEndpoint[]
): Array<[ReconnectEndpoint, ReconnectEndpoint]> => {
  const remaining = [...endpoints]
  const pairs: Array<[ReconnectEndpoint, ReconnectEndpoint]> = []

  while (remaining.length >= 2) {
    let bestPair: [number, number] | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (
      let sourceIndex = 0;
      sourceIndex < remaining.length;
      sourceIndex += 1
    ) {
      for (
        let targetIndex = sourceIndex + 1;
        targetIndex < remaining.length;
        targetIndex += 1
      ) {
        const source = remaining[sourceIndex]
        const target = remaining[targetIndex]

        if (
          source.originalNodeId &&
          target.originalNodeId &&
          source.originalNodeId === target.originalNodeId
        ) {
          continue
        }

        if (
          !source.originalNodeId &&
          source.pathId === target.pathId &&
          source.endpoint === target.endpoint
        ) {
          continue
        }

        const distance = Math.hypot(
          source.node.x - target.node.x,
          source.node.y - target.node.y
        )
        if (distance < bestDistance) {
          bestDistance = distance
          bestPair = [sourceIndex, targetIndex]
        }
      }
    }

    if (!bestPair) {
      break
    }

    const [sourceIndex, targetIndex] = bestPair
    const target = remaining.splice(targetIndex, 1)[0]
    const source = remaining.splice(sourceIndex, 1)[0]
    pairs.push([source, target])
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Deep-copy a node array. */
const cloneNodes = (nodes: PathNode[]): PathNode[] =>
  nodes.map((n) => ({ ...n }))

/** Create a new closed PathData from a node list. */
const createClosedPath = (
  sourcePathId: string,
  nodes: PathNode[]
): PathData => ({
  id: `${sourcePathId}_${generateId('reconnect')}`,
  closed: true,
  nodes: cloneNodes(nodes),
})

/**
 * Cut a closed path at the given sorted on-curve node indices.
 * Returns one chain per pair of adjacent split points.
 * Each chain includes both boundary nodes (the split-point nodes).
 */
const extractChains = (
  path: PathData,
  sortedIndices: number[]
): PathNode[][] => {
  const n = sortedIndices.length
  return sortedIndices.map((start, i) => {
    const end = sortedIndices[(i + 1) % n]
    const nodes =
      start < end
        ? path.nodes.slice(start, end + 1)
        : [...path.nodes.slice(start), ...path.nodes.slice(0, end + 1)]
    return cloneNodes(nodes)
  })
}

/**
 * Nudge the first and last nodes of a piece (which are split-point nodes)
 * slightly along their outgoing tangent direction, so that closing segments
 * of sibling pieces don't overlap exactly.
 */
const extendPieceEndpoints = (nodes: PathNode[]): void => {
  if (nodes.length < 2) {
    return
  }

  // Nudge first node
  const adj0 = nodes[1]
  const dx0 = nodes[0].x - adj0.x
  const dy0 = nodes[0].y - adj0.y
  const len0 = Math.hypot(dx0, dy0)
  if (len0 > 0.001) {
    nodes[0].x = Math.round(nodes[0].x + (dx0 / len0) * EXTENSION_DISTANCE)
    nodes[0].y = Math.round(nodes[0].y + (dy0 / len0) * EXTENSION_DISTANCE)
  }

  // Nudge last node
  const last = nodes.length - 1
  const adj1 = nodes[last - 1]
  const dx1 = nodes[last].x - adj1.x
  const dy1 = nodes[last].y - adj1.y
  const len1 = Math.hypot(dx1, dy1)
  if (len1 > 0.001) {
    nodes[last].x = Math.round(
      nodes[last].x + (dx1 / len1) * EXTENSION_DISTANCE
    )
    nodes[last].y = Math.round(
      nodes[last].y + (dy1 / len1) * EXTENSION_DISTANCE
    )
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconnect selected nodes on closed paths of a glyph.
 *
 * Supports:
 * - 2 selected nodes on one closed path → 2 independent closed paths (with
 *   split-point extension to avoid overlapping closing segments).
 * - 2K (K ≥ 2) selected nodes on one closed path → K closed paths formed by
 *   pairing opposite chains (guarantees crossing shapes like a Cross).
 * - Selections spanning multiple closed paths → cuts paths, pairs free
 *   endpoints by distance, and traces new combined closed paths.
 *
 * Returns the new selection keys, or an empty array if no reconnect occurred.
 */
export const performReconnect = (
  glyph: GlyphData,
  selectedNodeIds: string[]
): string[] => {
  // ── 1. Group selected nodes by path (skip offcurve / qcurve silently) ──
  const selectedByPath = new Map<string, Set<string>>()
  for (const selectionKey of selectedNodeIds) {
    const [pathId, nodeId] = selectionKey.split(':')
    if (!pathId || !nodeId) {
      continue
    }
    const path = glyph.paths.find((p) => p.id === pathId)
    const node = path?.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === 'offcurve' || node.type === 'qcurve') {
      continue
    }
    const nodeIds = selectedByPath.get(pathId) ?? new Set<string>()
    nodeIds.add(nodeId)
    selectedByPath.set(pathId, nodeIds)
  }

  // ── 2. Validate ──────────────────────────────────────────────────────────
  let totalSelected = 0
  for (const [pathId, nodeIds] of selectedByPath) {
    const path = glyph.paths.find((p) => p.id === pathId)
    if (!path || !path.closed) {
      return []
    }
    totalSelected += nodeIds.size
  }

  if (totalSelected < 2 || totalSelected % 2 !== 0) {
    return []
  }

  const nextSelection: string[] = []
  let didReconnect = false

  // ── 3. Branch: Single Path vs Multi-Path ────────────────────────────────
  if (selectedByPath.size === 1) {
    // SINGLE PATH LOGIC (Preserve existing i + K behavior for perfect Cross shapes)
    const pathId = Array.from(selectedByPath.keys())[0]
    const selectedIds = selectedByPath.get(pathId)!
    const path = glyph.paths.find((p) => p.id === pathId)!

    const selectedIndices = path.nodes
      .map((node, index) => (selectedIds.has(node.id) ? index : -1))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)

    if (selectedIndices.length !== selectedIds.size) {
      return []
    }

    const chains = extractChains(path, selectedIndices)
    const K = selectedIndices.length / 2
    const pieces: PathData[] = []

    if (K === 1) {
      for (const chainNodes of chains) {
        const pieceId = `${path.id}_${generateId('reconnect')}`
        const loopNodes = chainNodes.map((n) => {
          const newNode = { ...n, id: generateId('node') }
          if (selectedIds.has(n.id)) {
            nextSelection.push(`${pieceId}:${newNode.id}`)
          }
          return newNode
        })
        extendPieceEndpoints(loopNodes)
        pieces.push({ id: pieceId, closed: true, nodes: loopNodes })
      }
    } else {
      for (let i = 0; i < K; i++) {
        const pieceId = `${path.id}_${generateId('reconnect')}`
        const loopNodes = [...chains[i], ...chains[i + K]].map((n) => {
          const newNode = { ...n, id: generateId('node') }
          if (selectedIds.has(n.id)) {
            nextSelection.push(`${pieceId}:${newNode.id}`)
          }
          return newNode
        })
        pieces.push({ id: pieceId, closed: true, nodes: loopNodes })
      }
    }

    glyph.paths = glyph.paths.filter((p) => p.id !== pathId)
    glyph.paths.push(...pieces)
    didReconnect = true
  } else {
    // MULTI-PATH LOGIC (Global greedy nearest-endpoint matching)
    interface ChainInfo {
      id: number
      nodes: PathNode[]
    }
    const allChains: ChainInfo[] = []
    let chainCounter = 0
    const pathsToRemove = new Set<string>()

    for (const [pathId, selectedIds] of selectedByPath) {
      const path = glyph.paths.find((p) => p.id === pathId)!
      pathsToRemove.add(pathId)

      const selectedIndices = path.nodes
        .map((node, index) => (selectedIds.has(node.id) ? index : -1))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)

      if (selectedIndices.length === 0) {
        continue
      }

      if (selectedIndices.length === 1) {
        // Cut at 1 node -> 1 chain that loops back to it
        const idx = selectedIndices[0]
        const chainNodes = [
          ...path.nodes.slice(idx),
          ...path.nodes.slice(0, idx + 1),
        ]
        allChains.push({ id: chainCounter++, nodes: cloneNodes(chainNodes) })
      } else {
        const chains = extractChains(path, selectedIndices)
        for (const chain of chains) {
          allChains.push({ id: chainCounter++, nodes: chain })
        }
      }
    }

    // Build endpoints
    const endpoints: ReconnectEndpoint[] = []
    for (const chain of allChains) {
      endpoints.push({
        pathId: 'multi',
        nodeId: chain.nodes[0].id,
        node: chain.nodes[0],
        endpoint: 'start',
        chainId: chain.id,
        originalNodeId: chain.nodes[0].id,
      })
      endpoints.push({
        pathId: 'multi',
        nodeId: chain.nodes[chain.nodes.length - 1].id,
        node: chain.nodes[chain.nodes.length - 1],
        endpoint: 'end',
        chainId: chain.id,
        originalNodeId: chain.nodes[chain.nodes.length - 1].id,
      })
    }

    const pairs = pairNearestEndpoints(endpoints)

    // Trace loops
    const adj = new Map<string, { chainId: number; side: 'start' | 'end' }>()
    for (const [source, target] of pairs) {
      adj.set(`${source.chainId}:${source.endpoint}`, {
        chainId: target.chainId!,
        side: target.endpoint,
      })
      adj.set(`${target.chainId}:${target.endpoint}`, {
        chainId: source.chainId!,
        side: source.endpoint,
      })
    }

    const visitedChains = new Set<number>()
    const pieces: PathData[] = []

    const allSelectedIds = new Set<string>()
    for (const set of selectedByPath.values()) {
      for (const id of set) {
        allSelectedIds.add(id)
      }
    }

    for (const chain of allChains) {
      if (visitedChains.has(chain.id)) {
        continue
      }

      const loopNodes: PathNode[] = []
      let currentChainId = chain.id
      let movingForward = true
      const pieceId = generateId('path')

      while (!visitedChains.has(currentChainId)) {
        visitedChains.add(currentChainId)
        const currentChain = allChains[currentChainId]
        const nodesToAdd = movingForward
          ? currentChain.nodes
          : [...currentChain.nodes].reverse()

        for (const node of nodesToAdd) {
          const newNode = { ...node, id: generateId('node') }
          loopNodes.push(newNode)
          if (allSelectedIds.has(node.id)) {
            nextSelection.push(`${pieceId}:${newNode.id}`)
          }
        }

        const exitSide = movingForward ? 'end' : 'start'
        const nextHop = adj.get(`${currentChainId}:${exitSide}`)

        if (!nextHop) {
          break
        }

        currentChainId = nextHop.chainId
        movingForward = nextHop.side === 'start'
      }

      pieces.push({
        id: pieceId,
        closed: true,
        nodes: loopNodes,
      })
    }

    glyph.paths = glyph.paths.filter((p) => !pathsToRemove.has(p.id))
    glyph.paths.push(...pieces)
    didReconnect = true
  }

  return didReconnect ? Array.from(new Set(nextSelection)) : []
}
