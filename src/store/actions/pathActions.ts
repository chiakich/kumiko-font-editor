/**
 * Path-level store actions: create, modify, delete paths and nodes,
 * connect/reconnect open paths, convert segments.
 */
import type { StateCreator } from 'zustand'
import {
  buildBooleanOperationPaths,
  type PathBooleanOperation,
} from '../../lib/pathBooleanOperations'
import type { GlobalState, PathData, PathNode } from '../types'
import {
  findPath,
  generateId,
  isPathEndpointNode,
  lerp,
  orientOpenPathNodesForConnection,
} from '../glyphGeometry'
import { pairNearestEndpoints, performReconnect } from '../reconnectNodes'
import { markGlyphDirty } from '../dirtyState'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

export const buildPathActions = (set: ImmerSet) => ({
  createPath: (glyphId: string, path: Omit<PathData, 'id'> & { id?: string }) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }

      glyph.paths.push({
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
      const path = glyph ? findPath(glyph, pathId) : undefined
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
      const path = glyph ? findPath(glyph, pathId) : undefined
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
      if (!glyph || pieces.length === 0) {
        return
      }

      const pathIndex = glyph.paths.findIndex((path) => path.id === pathId)
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

      glyph.paths.splice(pathIndex, 1, ...normalizedPieces)
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),

  closePath: (glyphId: string, pathId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const path = glyph ? findPath(glyph, pathId) : undefined
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
      const sourcePath = glyph ? findPath(glyph, sourcePathId) : undefined
      const targetPath = glyph ? findPath(glyph, targetPathId) : undefined
      if (
        !glyph ||
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
      glyph.paths = glyph.paths.filter((path) => path.id !== targetPathId)

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
      if (!glyph || selectedNodeIds.length < 2) {
        return
      }

      // ── Try closed-path reconnection first ──────────────────────────────
      const closedReconnectSelection = performReconnect(glyph, selectedNodeIds)
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
        const path = pathId ? findPath(glyph, pathId) : undefined
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
        const sourcePath = findPath(glyph, source.pathId)
        const targetPath = findPath(glyph, target.pathId)
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
        glyph.paths = glyph.paths.filter((path) => path.id !== target.pathId)
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
      const selectedPathIds = Array.from(new Set(pathIds))
      if (!glyph || selectedPathIds.length < 2) {
        return
      }

      const selectedPaths = selectedPathIds.flatMap((pathId) => {
        const path = findPath(glyph, pathId)
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
      const firstSelectedPathIndex = glyph.paths.findIndex((path) =>
        selectedPathIdSet.has(path.id)
      )
      glyph.paths = glyph.paths.filter(
        (path) => !selectedPathIdSet.has(path.id)
      )
      glyph.paths.splice(Math.max(0, firstSelectedPathIndex), 0, ...resultPaths)

      nextSelection = resultPaths.flatMap((path) =>
        path.nodes.map((node) => `${path.id}:${node.id}`)
      )
      state.selectedNodeIds = nextSelection
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    })

    return nextSelection
  },

  convertLineSegmentToCurve: (
    glyphId: string,
    pathId: string,
    startNodeId: string,
    endNodeId: string
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const path = glyph ? findPath(glyph, pathId) : undefined
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
      if (
        startNode.type === 'offcurve' ||
        startNode.type === 'qcurve' ||
        endNode.type === 'offcurve' ||
        endNode.type === 'qcurve'
      ) {
        return
      }

      const handle1: PathNode = {
        id: generateId('node'),
        x: Math.round(lerp(startNode.x, endNode.x, 1 / 3)),
        y: Math.round(lerp(startNode.y, endNode.y, 1 / 3)),
        type: 'offcurve',
      }
      const handle2: PathNode = {
        id: generateId('node'),
        x: Math.round(lerp(startNode.x, endNode.x, 2 / 3)),
        y: Math.round(lerp(startNode.y, endNode.y, 2 / 3)),
        type: 'offcurve',
      }

      path.nodes = [
        ...path.nodes.slice(0, startIndex),
        { ...startNode, type: 'smooth' },
        handle1,
        handle2,
        { ...endNode, type: 'smooth' },
        ...path.nodes.slice(endIndex + 1),
      ]
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),

  reversePaths: (glyphId: string, pathIds: string[]) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const pathIdSet = new Set(pathIds)
      if (!glyph || pathIdSet.size === 0) {
        return
      }

      let didReverse = false
      for (const path of glyph.paths) {
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

  deleteSelectedNodes: (glyphId: string, selectedNodeIds: string[]) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph || selectedNodeIds.length === 0) {
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

      glyph.paths = glyph.paths
        .map((path) => {
          const nodeIds = selectedByPath.get(path.id)
          if (!nodeIds) {
            return path
          }
          return {
            ...path,
            nodes: path.nodes.filter((node) => !nodeIds.has(node.id)),
          }
        })
        .filter((path) => path.nodes.length > 0)

      state.selectedNodeIds = []
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),
})
