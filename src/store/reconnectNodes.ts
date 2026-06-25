import type { GlyphLayerData, PathData, PathNode } from 'src/store/types'
import { isOffCurveNode } from 'src/store/glyphGeometry'
import { generateId } from 'src/store/glyphGeometry'

/** Fixed nudge distance (font units) to avoid overlapping closing segments. */
const EXTENSION_DISTANCE = 2

export type ReconnectEndpoint = {
  pathId: string
  nodeId: string
  node: PathNode
  endpoint: 'start' | 'end'
  chainId?: number
  originalNodeId?: string
  /**
   * Unit tangent pointing from this endpoint *into* its own chain. Used to
   * reconnect crossing strokes by continuity (straight-through) rather than by
   * raw distance. Undefined when the chain is too short to derive a direction.
   */
  dir?: { x: number; y: number }
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

/** Endpoints within this distance (font units) are treated as one junction. */
const JUNCTION_EPS = 1.5

const coincident = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= JUNCTION_EPS

/**
 * Unit tangent pointing from a chain's endpoint into the chain (toward the
 * first node that is actually distinct from the endpoint, so off-curve handles
 * and zero-length steps still yield a meaningful direction). Returns null for
 * chains too short or degenerate to derive a direction.
 */
const endpointDirection = (
  nodes: PathNode[],
  side: 'start' | 'end'
): { x: number; y: number } | null => {
  const count = nodes.length
  if (count < 2) {
    return null
  }
  const origin = side === 'start' ? nodes[0] : nodes[count - 1]
  const step = side === 'start' ? 1 : -1
  for (
    let i = side === 'start' ? 1 : count - 2;
    i >= 0 && i < count;
    i += step
  ) {
    const dx = nodes[i].x - origin.x
    const dy = nodes[i].y - origin.y
    const len = Math.hypot(dx, dy)
    if (len > 0.001) {
      return { x: dx / len, y: dy / len }
    }
  }
  return null
}

const tangentDot = (a: ReconnectEndpoint, b: ReconnectEndpoint): number =>
  a.dir && b.dir ? a.dir.x * b.dir.x + a.dir.y * b.dir.y : 0

/**
 * Pair the endpoints of a single junction (a cluster of coincident endpoints)
 * by stroke continuity: repeatedly join the two stubs whose tangents are most
 * opposite (dot → -1), i.e. the connection that carries the stroke straight
 * through the junction. This is what turns a crossing into one stroke per axis
 * instead of pinwheels / L-shapes.
 */
const matchJunction = (
  cluster: ReconnectEndpoint[]
): {
  pairs: Array<[ReconnectEndpoint, ReconnectEndpoint]>
  leftover: ReconnectEndpoint[]
} => {
  const remaining = [...cluster]
  const pairs: Array<[ReconnectEndpoint, ReconnectEndpoint]> = []

  while (remaining.length >= 2) {
    let bestPair: [number, number] | null = null
    let bestDot = Number.POSITIVE_INFINITY

    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        // Never close a chain onto its own other end here; bridging a chain to
        // itself is the distance-fallback's job, not a through-junction.
        if (remaining[i].chainId === remaining[j].chainId) {
          continue
        }
        const dot = tangentDot(remaining[i], remaining[j])
        if (dot < bestDot) {
          bestDot = dot
          bestPair = [i, j]
        }
      }
    }

    if (!bestPair) {
      break
    }

    const [i, j] = bestPair
    const second = remaining.splice(j, 1)[0]
    const first = remaining.splice(i, 1)[0]
    pairs.push([first, second])
  }

  return { pairs, leftover: remaining }
}

/**
 * Reconnect free chain endpoints by stroke continuity. Endpoints that land on
 * the same junction (coincident positions, as where overlapping strokes cross)
 * are matched straight-through by tangent; any endpoints that don't share a
 * junction fall back to nearest-distance pairing.
 */
export const pairEndpointsByContinuity = (
  endpoints: ReconnectEndpoint[]
): Array<[ReconnectEndpoint, ReconnectEndpoint]> => {
  const clusters: ReconnectEndpoint[][] = []
  for (const endpoint of endpoints) {
    const cluster = clusters.find(
      (members) =>
        Math.hypot(
          members[0].node.x - endpoint.node.x,
          members[0].node.y - endpoint.node.y
        ) <= JUNCTION_EPS
    )
    if (cluster) {
      cluster.push(endpoint)
    } else {
      clusters.push([endpoint])
    }
  }

  const pairs: Array<[ReconnectEndpoint, ReconnectEndpoint]> = []
  const leftovers: ReconnectEndpoint[] = []
  for (const cluster of clusters) {
    if (cluster.length < 2) {
      leftovers.push(...cluster)
      continue
    }
    const { pairs: junctionPairs, leftover } = matchJunction(cluster)
    pairs.push(...junctionPairs)
    leftovers.push(...leftover)
  }

  if (leftovers.length >= 2) {
    pairs.push(...pairNearestEndpoints(leftovers))
  }

  return pairs
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Deep-copy a node array. */
const cloneNodes = (nodes: PathNode[]): PathNode[] =>
  nodes.map((n) => ({ ...n }))

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
  layer: GlyphLayerData,
  selectedNodeIds: string[]
): string[] => {
  // ── 1. Group selected nodes by path (skip offcurve / qcurve silently) ──
  const selectedByPath = new Map<string, Set<string>>()
  for (const selectionKey of selectedNodeIds) {
    const [pathId, nodeId] = selectionKey.split(':')
    if (!pathId || !nodeId) {
      continue
    }
    const path = layer.paths.find((p) => p.id === pathId)
    const node = path?.nodes.find((n) => n.id === nodeId)
    if (!node || isOffCurveNode(node)) {
      continue
    }
    const nodeIds = selectedByPath.get(pathId) ?? new Set<string>()
    nodeIds.add(nodeId)
    selectedByPath.set(pathId, nodeIds)
  }

  // ── 2. Validate ──────────────────────────────────────────────────────────
  let totalSelected = 0
  for (const [pathId, nodeIds] of selectedByPath) {
    const path = layer.paths.find((p) => p.id === pathId)
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
    const path = layer.paths.find((p) => p.id === pathId)!

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

    layer.paths = layer.paths.filter((p) => p.id !== pathId)
    layer.paths.push(...pieces)
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
      const path = layer.paths.find((p) => p.id === pathId)!
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

    // Build endpoints, carrying each stub's tangent so crossing strokes can be
    // reconnected straight-through instead of by raw distance.
    const endpoints: ReconnectEndpoint[] = []
    for (const chain of allChains) {
      const last = chain.nodes.length - 1
      endpoints.push({
        pathId: 'multi',
        nodeId: chain.nodes[0].id,
        node: chain.nodes[0],
        endpoint: 'start',
        chainId: chain.id,
        originalNodeId: chain.nodes[0].id,
        dir: endpointDirection(chain.nodes, 'start') ?? undefined,
      })
      endpoints.push({
        pathId: 'multi',
        nodeId: chain.nodes[last].id,
        node: chain.nodes[last],
        endpoint: 'end',
        chainId: chain.id,
        originalNodeId: chain.nodes[last].id,
        dir: endpointDirection(chain.nodes, 'end') ?? undefined,
      })
    }

    const pairs = pairEndpointsByContinuity(endpoints)

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

      const tracedNodes: PathNode[] = []
      let currentChainId = chain.id
      let movingForward = true
      const pieceId = generateId('path')

      while (!visitedChains.has(currentChainId)) {
        visitedChains.add(currentChainId)
        const currentChain = allChains[currentChainId]
        tracedNodes.push(
          ...(movingForward
            ? currentChain.nodes
            : [...currentChain.nodes].reverse())
        )

        const exitSide = movingForward ? 'end' : 'start'
        const nextHop = adj.get(`${currentChainId}:${exitSide}`)

        if (!nextHop) {
          break
        }

        currentChainId = nextHop.chainId
        movingForward = nextHop.side === 'start'
      }

      // Weld coincident junction nodes: adjacent chains each carry the shared
      // cut node, so collapse runs of coincident nodes (and the closing wrap)
      // into one to avoid zero-length segments. When welding, keep a selected
      // source id so the user's selection survives onto the surviving node.
      const weldedNodes: PathNode[] = []
      for (const node of tracedNodes) {
        const prev = weldedNodes[weldedNodes.length - 1]
        if (prev && coincident(prev, node)) {
          if (allSelectedIds.has(node.id)) {
            prev.id = node.id
          }
          continue
        }
        weldedNodes.push({ ...node })
      }
      while (
        weldedNodes.length > 2 &&
        coincident(weldedNodes[0], weldedNodes[weldedNodes.length - 1])
      ) {
        const dropped = weldedNodes.pop()!
        if (allSelectedIds.has(dropped.id)) {
          weldedNodes[0].id = dropped.id
        }
      }

      const loopNodes = weldedNodes.map((node) => {
        const newNode = { ...node, id: generateId('node') }
        if (allSelectedIds.has(node.id)) {
          nextSelection.push(`${pieceId}:${newNode.id}`)
        }
        return newNode
      })

      pieces.push({
        id: pieceId,
        closed: true,
        nodes: loopNodes,
      })
    }

    layer.paths = layer.paths.filter((p) => !pathsToRemove.has(p.id))
    layer.paths.push(...pieces)
    didReconnect = true
  }

  return didReconnect ? Array.from(new Set(nextSelection)) : []
}
