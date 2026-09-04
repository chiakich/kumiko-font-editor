/**
 * Path-level store actions: create, modify, delete paths and nodes,
 * connect/reconnect open paths, convert segments.
 */
import { current } from 'immer'
import type { StateCreator } from 'zustand'
import {
  buildBooleanOperationPaths,
  type PathBooleanOperation,
} from '@/lib/pathBooleanOperations'
import {
  offsetGlyphPaths,
  type OutlineOffsetOptions,
} from '@/lib/outlineOffset'
import type { PathData, PathNode } from '@/domain'
import type { GlobalState } from '@/store/types'
import {
  findPath,
  generateId,
  isOffCurveNode,
  isPathEndpointNode,
  lerp,
  orientOpenPathNodesForConnection,
  recomputeGlyphSidebearings,
} from '@/domain/glyphGeometry'
import { ensureLoadedActiveLayer } from '@/domain/glyphLayer'
import { pairNearestEndpoints, performReconnect } from '@/domain/reconnectNodes'
import { syncFilteredGlyphList } from '@/store/glyphSearch'
import { markGlyphDirty } from '@/store/dirtyState'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

const isHandleNode = (node: PathNode) => isOffCurveNode(node)

const addAttachedHandleIds = (
  path: PathData,
  anchorIndex: number,
  direction: -1 | 1,
  expandedSelection: Set<string>
) => {
  let currentIndex = anchorIndex

  while (true) {
    currentIndex += direction

    if (currentIndex < 0 || currentIndex >= path.nodes.length) {
      if (!path.closed) {
        return
      }
      currentIndex = direction > 0 ? 0 : path.nodes.length - 1
    }

    if (currentIndex === anchorIndex) {
      return
    }

    const node = path.nodes[currentIndex]
    if (!node || !isHandleNode(node)) {
      return
    }

    expandedSelection.add(node.id)
  }
}

const expandSelectionWithAttachedHandles = (
  path: PathData,
  selectedNodeIds: Set<string>
) => {
  const expandedSelection = new Set(selectedNodeIds)

  path.nodes.forEach((node, index) => {
    if (!selectedNodeIds.has(node.id) || isHandleNode(node)) {
      return
    }

    addAttachedHandleIds(path, index, -1, expandedSelection)
    addAttachedHandleIds(path, index, 1, expandedSelection)
  })

  return expandedSelection
}

export const buildPathActions = (set: ImmerSet) => ({
  createPath: (glyphId: string, path: Omit<PathData, 'id'> & { id?: string }) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      if (!glyph || !layer) {
        return
      }

      layer.paths.push({
        ...path,
        id: path.id || generateId('path'),
        nodes: path.nodes.map((node) => ({
          ...node,
          id: node.id || generateId('node'),
        })),
      })
      markGlyphDirty(state, glyphId)
    }),

  appendNodesToPath: (
    glyphId: string,
    pathId: string,
    nodes: PathNode[],
    prepend = false
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const path = layer ? findPath(layer, pathId) : undefined
      if (!path) {
        return
      }

      const normalizedNodes = nodes.map((node) => ({
        ...node,
        id: node.id || generateId('node'),
      }))

      path.nodes = prepend
        ? [...normalizedNodes, ...path.nodes]
        : [...path.nodes, ...normalizedNodes]
      markGlyphDirty(state, glyphId)
    }),

  replacePathNodes: (
    glyphId: string,
    pathId: string,
    startNodeId: string,
    endNodeId: string,
    nodes: PathNode[]
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const path = layer ? findPath(layer, pathId) : undefined
      if (!path) {
        return
      }

      const startIndex = path.nodes.findIndex((node) => node.id === startNodeId)
      const endIndex = path.nodes.findIndex((node) => node.id === endNodeId)
      if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
        return
      }

      const normalizedNodes = nodes.map((node) => ({
        ...node,
        id: node.id || generateId('node'),
      }))

      path.nodes = [
        ...path.nodes.slice(0, startIndex),
        ...normalizedNodes,
        ...path.nodes.slice(endIndex + 1),
      ]
      markGlyphDirty(state, glyphId)
    }),

  replacePathWithOpenPieces: (
    glyphId: string,
    pathId: string,
    pieces: Array<Omit<PathData, 'id'> & { id?: string }>
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      if (!glyph || !layer || pieces.length === 0) {
        return
      }

      const pathIndex = layer.paths.findIndex((path) => path.id === pathId)
      if (pathIndex < 0) {
        return
      }

      const normalizedPieces = pieces
        .map((piece) => ({
          ...piece,
          id: piece.id || generateId('path'),
          closed: piece.closed,
          nodes: piece.nodes.map((node) => ({
            ...node,
            id: node.id || generateId('node'),
          })),
        }))
        .filter((piece) => piece.nodes.length > 1)

      if (normalizedPieces.length === 0) {
        return
      }

      layer.paths.splice(pathIndex, 1, ...normalizedPieces)
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),

  closePath: (glyphId: string, pathId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const path = layer ? findPath(layer, pathId) : undefined
      if (!path || path.closed || path.nodes.length < 2) {
        return
      }

      path.closed = true
      markGlyphDirty(state, glyphId)
    }),

  connectOpenPaths: (
    glyphId: string,
    sourcePathId: string,
    sourceNodeId: string,
    targetPathId: string,
    targetNodeId: string
  ) => {
    let result: { pathId: string; nodeIds: string[] } | null = null

    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const sourcePath = layer ? findPath(layer, sourcePathId) : undefined
      const targetPath = layer ? findPath(layer, targetPathId) : undefined
      if (
        !glyph ||
        !layer ||
        !sourcePath ||
        !targetPath ||
        sourcePath.closed ||
        targetPath.closed ||
        !isPathEndpointNode(sourcePath, sourceNodeId) ||
        !isPathEndpointNode(targetPath, targetNodeId)
      ) {
        return
      }

      if (sourcePathId === targetPathId) {
        if (sourceNodeId === targetNodeId) {
          return
        }
        sourcePath.closed = true
        result = {
          pathId: sourcePathId,
          nodeIds: sourcePath.nodes.map((node) => node.id),
        }
        markGlyphDirty(state, glyphId)
        return
      }

      const sourceNodes = orientOpenPathNodesForConnection(
        sourcePath,
        sourceNodeId,
        'end'
      )
      const targetNodes = orientOpenPathNodesForConnection(
        targetPath,
        targetNodeId,
        'start'
      )

      sourcePath.nodes = [...sourceNodes, ...targetNodes]
      sourcePath.closed = false
      layer.paths = layer.paths.filter((path) => path.id !== targetPathId)

      result = {
        pathId: sourcePathId,
        nodeIds: sourcePath.nodes.map((node) => node.id),
      }
      markGlyphDirty(state, glyphId)
    })

    return result
  },

  reconnectSelectedNodes: (glyphId: string, selectedNodeIds: string[]) => {
    let nextSelection: string[] = []

    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      if (!glyph || !layer || selectedNodeIds.length < 2) {
        return
      }

      // ── Try closed-path reconnection first ──────────────────────────────
      const closedReconnectSelection = performReconnect(layer, selectedNodeIds)
      if (closedReconnectSelection.length > 0) {
        nextSelection = closedReconnectSelection
        state.selectedNodeIds = nextSelection
        state.selectedSegment = null
        markGlyphDirty(state, glyphId)
        return
      }

      // ── Fall back to open-path endpoint pairing ─────────────────────────
      const endpoints = selectedNodeIds.flatMap((selectionKey) => {
        const [pathId, nodeId] = selectionKey.split(':')
        const path = pathId ? findPath(layer, pathId) : undefined
        if (!path || path.closed || !nodeId) {
          return []
        }

        const nodeIndex = path.nodes.findIndex((node) => node.id === nodeId)
        if (nodeIndex !== 0 && nodeIndex !== path.nodes.length - 1) {
          return []
        }

        const node = path.nodes[nodeIndex]
        return [
          {
            pathId,
            nodeId,
            node,
            endpoint: nodeIndex === 0 ? ('start' as const) : ('end' as const),
          },
        ]
      })

      const pairs = pairNearestEndpoints(endpoints)
      if (pairs.length === 0) {
        return
      }

      const selectedAfterReconnect: string[] = []
      for (const [source, target] of pairs) {
        const sourcePath = findPath(layer, source.pathId)
        const targetPath = findPath(layer, target.pathId)
        if (
          !sourcePath ||
          !targetPath ||
          sourcePath.closed ||
          targetPath.closed ||
          !isPathEndpointNode(sourcePath, source.nodeId) ||
          !isPathEndpointNode(targetPath, target.nodeId)
        ) {
          continue
        }

        if (source.pathId === target.pathId) {
          if (source.nodeId === target.nodeId) {
            continue
          }
          sourcePath.closed = true
          selectedAfterReconnect.push(
            `${source.pathId}:${source.nodeId}`,
            `${source.pathId}:${target.nodeId}`
          )
          continue
        }

        const sourceNodes = orientOpenPathNodesForConnection(
          sourcePath,
          source.nodeId,
          'end'
        )
        const targetNodes = orientOpenPathNodesForConnection(
          targetPath,
          target.nodeId,
          'start'
        )

        sourcePath.nodes = [...sourceNodes, ...targetNodes]
        sourcePath.closed = false
        layer.paths = layer.paths.filter((path) => path.id !== target.pathId)
        selectedAfterReconnect.push(
          `${source.pathId}:${source.nodeId}`,
          `${source.pathId}:${target.nodeId}`
        )
      }

      if (selectedAfterReconnect.length === 0) {
        return
      }

      nextSelection = Array.from(new Set(selectedAfterReconnect))
      state.selectedNodeIds = nextSelection
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    })

    return nextSelection
  },

  applyPathBooleanOperation: (
    glyphId: string,
    pathIds: string[],
    operation: PathBooleanOperation
  ) => {
    let nextSelection: string[] = []

    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const selectedPathIds = Array.from(new Set(pathIds))
      if (!glyph || !layer || selectedPathIds.length < 2) {
        return
      }

      const selectedPaths = selectedPathIds.flatMap((pathId) => {
        const path = findPath(layer, pathId)
        return path?.closed ? [path] : []
      })
      if (selectedPaths.length < 2) {
        return
      }

      const resultPaths = buildBooleanOperationPaths(selectedPaths, operation)
      if (resultPaths.length === 0) {
        return
      }

      const selectedPathIdSet = new Set(selectedPathIds)
      const firstSelectedPathIndex = layer.paths.findIndex((path) =>
        selectedPathIdSet.has(path.id)
      )
      layer.paths = layer.paths.filter(
        (path) => !selectedPathIdSet.has(path.id)
      )
      layer.paths.splice(Math.max(0, firstSelectedPathIndex), 0, ...resultPaths)

      nextSelection = resultPaths.flatMap((path) =>
        path.nodes.map((node) => `${path.id}:${node.id}`)
      )
      state.selectedNodeIds = nextSelection
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    })

    return nextSelection
  },

  // Embolden/thin the whole glyph outline by offsetting every contour along its
  // outward normal. Positive distance grows ink, negative shrinks it. Without
  // cleanup, node ids are preserved (interpolation-safe); with cleanup, contours
  // are rebuilt to resolve overlaps so selection is dropped.
  applyOutlineOffset: (
    glyphId: string,
    distance: number,
    options: OutlineOffsetOptions = {}
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      if (!glyph || !layer || !Number.isFinite(distance) || distance === 0) {
        return
      }

      const before = current(layer.paths)
      const { paths, rebuilt } = offsetGlyphPaths(before, distance, options)
      if (paths === before) {
        return
      }

      layer.paths = paths
      // Only a rebuild changes node ids, which would invalidate the selection.
      if (rebuilt) {
        state.selectedNodeIds = []
        state.selectedSegment = null
      }
      recomputeGlyphSidebearings(layer)
      markGlyphDirty(state, glyphId)
    }),

  applyBatchOutlineOffset: (
    glyphIds: string[],
    distance: number,
    options: OutlineOffsetOptions = {}
  ) =>
    set((state) => {
      if (!Number.isFinite(distance) || distance === 0) {
        return
      }

      let didOffset = false
      for (const glyphId of glyphIds) {
        const glyph = state.fontData?.glyphs[glyphId]
        const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
        if (!glyph || !layer) {
          continue
        }

        const before = current(layer.paths)
        const { paths } = offsetGlyphPaths(before, distance, options)
        if (paths === before) {
          continue
        }

        layer.paths = paths
        recomputeGlyphSidebearings(layer)
        markGlyphDirty(state, glyphId)
        didOffset = true
      }

      if (!didOffset) {
        return
      }
      state.selectedNodeIds = []
      state.selectedSegment = null
      // Refresh the overview grid so transformed shapes re-render.
      syncFilteredGlyphList(state)
    }),

  convertLineSegmentToCurve: (
    glyphId: string,
    pathId: string,
    startNodeId: string,
    endNodeId: string
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const path = layer ? findPath(layer, pathId) : undefined
      if (!glyph || !path) {
        return
      }

      const startIndex = path.nodes.findIndex((node) => node.id === startNodeId)
      const endIndex = path.nodes.findIndex((node) => node.id === endNodeId)
      if (startIndex < 0 || endIndex !== startIndex + 1) {
        return
      }

      const startNode = path.nodes[startIndex]
      const endNode = path.nodes[endIndex]
      if (isOffCurveNode(startNode) || isOffCurveNode(endNode)) {
        return
      }

      const handle1: PathNode = {
        id: generateId('node'),
        x: Math.round(lerp(startNode.x, endNode.x, 1 / 3)),
        y: Math.round(lerp(startNode.y, endNode.y, 1 / 3)),
        kind: 'offcurve',
      }
      const handle2: PathNode = {
        id: generateId('node'),
        x: Math.round(lerp(startNode.x, endNode.x, 2 / 3)),
        y: Math.round(lerp(startNode.y, endNode.y, 2 / 3)),
        kind: 'offcurve',
      }

      path.nodes = [
        ...path.nodes.slice(0, startIndex),
        { ...startNode, kind: 'oncurve', smooth: true },
        handle1,
        handle2,
        {
          ...endNode,
          kind: 'oncurve',
          segmentType: 'cubic',
          smooth: true,
        },
        ...path.nodes.slice(endIndex + 1),
      ]
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),

  reversePaths: (glyphId: string, pathIds: string[]) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const pathIdSet = new Set(pathIds)
      if (!glyph || !layer || pathIdSet.size === 0) {
        return
      }

      let didReverse = false
      for (const path of layer.paths) {
        if (!pathIdSet.has(path.id) || path.nodes.length < 2) {
          continue
        }

        path.nodes = [...path.nodes].reverse()
        didReverse = true
      }

      if (!didReverse) {
        return
      }

      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),

  // Rotate a closed contour so the given on-curve node becomes its start
  // point. Pure reorder — the shape is unchanged. Consistent start points
  // keep contours interpolation-compatible across masters.
  setStartPoint: (glyphId: string, pathId: string, nodeId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      const path = layer?.paths.find((candidate) => candidate.id === pathId)
      if (!path || !path.closed) {
        return
      }

      const index = path.nodes.findIndex((node) => node.id === nodeId)
      if (index <= 0 || isHandleNode(path.nodes[index])) {
        return
      }

      path.nodes = [...path.nodes.slice(index), ...path.nodes.slice(0, index)]
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),

  deleteSelectedNodes: (glyphId: string, selectedNodeIds: string[]) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const layer = glyph ? ensureLoadedActiveLayer(glyph) : undefined
      if (!glyph || !layer || selectedNodeIds.length === 0) {
        return
      }

      const selectedByPath = new Map<string, Set<string>>()
      for (const selectedNodeId of selectedNodeIds) {
        const [pathId, nodeId] = selectedNodeId.split(':')
        if (!pathId || !nodeId) {
          continue
        }
        const ids = selectedByPath.get(pathId) ?? new Set<string>()
        ids.add(nodeId)
        selectedByPath.set(pathId, ids)
      }

      layer.paths = layer.paths
        .map((path) => {
          const nodeIds = selectedByPath.get(path.id)
          if (!nodeIds) {
            return path
          }
          const expandedNodeIds = expandSelectionWithAttachedHandles(
            path,
            nodeIds
          )
          return {
            ...path,
            nodes: path.nodes.filter((node) => !expandedNodeIds.has(node.id)),
          }
        })
        .filter((path) => path.nodes.length > 0)

      state.selectedNodeIds = []
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),
})
