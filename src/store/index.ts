import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { temporal, type TemporalState } from 'zundo'
import {
  clearProjectArchive,
  getArchivedGlyphLayer,
  getProjectArchiveFirstMasterId,
  ingestProjectData,
} from '../lib/projectArchive'
import type { GlobalState, GlyphData, PathData, PathNode } from './types'
import {
  findNode,
  findPath,
  generateId,
  getGlyphXBounds,
  isPathEndpointNode,
  lerp,
  orientOpenPathNodesForConnection,
  recomputeGlyphSidebearings,
  translateGlyphHorizontally,
} from './glyphGeometry'
import {
  clampEditorActiveGlyphIndex,
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
  syncSelectedGlyphFromEditorLine,
} from './editorLine'
import { IDS_DICTIONARY, syncFilteredGlyphList } from './glyphSearch'
import { syncGlyphTopLevelFromLayer } from './glyphLayer'
import { markGlyphDirty } from './dirtyState'
export { getGlyphLayer } from './glyphLayer'
export { getEffectiveNodeType, isPathEndpointNode } from './glyphGeometry'
export { deterministicStringify } from './deterministicStringify'
export type {
  FontData,
  GlyphAnchor,
  GlyphComponentRef,
  GlyphData,
  GlyphGuideline,
  GlyphLayerData,
  GlyphMetrics,
  GlobalState,
  NodeType,
  OverviewGroupByState,
  PathData,
  PathNode,
  SelectedNodeRef,
  SelectedSegmentState,
  ViewportState,
  WorkspaceView,
} from './types'

type ReconnectEndpoint = {
  pathId: string
  nodeId: string
  node: PathNode
  endpoint: 'start' | 'end'
}

const pairNearestEndpoints = (endpoints: ReconnectEndpoint[]) => {
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

const reconnectFourClosedNodes = (
  glyph: GlyphData,
  selectedNodeIds: string[]
) => {
  const selectedByPath = new Map<string, Set<string>>()
  for (const selectionKey of selectedNodeIds) {
    const [pathId, nodeId] = selectionKey.split(':')
    if (!pathId || !nodeId) {
      continue
    }
    const nodeIds = selectedByPath.get(pathId) ?? new Set<string>()
    nodeIds.add(nodeId)
    selectedByPath.set(pathId, nodeIds)
  }

  const nextSelection: string[] = []
  let didReconnect = false

  glyph.paths = glyph.paths.flatMap((path) => {
    const selectedIds = selectedByPath.get(path.id)
    if (!path.closed || selectedIds?.size !== 4) {
      return [path]
    }

    const selectedIndices = path.nodes
      .map((node, index) => (selectedIds.has(node.id) ? index : -1))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)
    if (selectedIndices.length !== 4) {
      return [path]
    }

    const chains = selectedIndices.map((start, index) => {
      const end = selectedIndices[(index + 1) % selectedIndices.length]
      return start < end
        ? path.nodes.slice(start, end + 1)
        : [...path.nodes.slice(start), ...path.nodes.slice(0, end + 1)]
    })

    const firstPiece = createReconnectedClosedPath(path.id, [
      ...chains[0],
      ...chains[2],
    ])
    const secondPiece = createReconnectedClosedPath(path.id, [
      ...chains[1],
      ...chains[3],
    ])

    for (const piece of [firstPiece, secondPiece]) {
      for (const node of piece.nodes) {
        if (selectedIds.has(node.id)) {
          nextSelection.push(`${piece.id}:${node.id}`)
        }
      }
    }

    didReconnect = true
    return [firstPiece, secondPiece]
  })

  return didReconnect ? Array.from(new Set(nextSelection)) : []
}

const createReconnectedClosedPath = (
  sourcePathId: string,
  nodes: PathNode[]
): PathData => ({
  id: `${sourcePathId}_${generateId('reconnect')}`,
  closed: true,
  nodes: nodes.map((node) => ({ ...node })),
})

export const useStore = create<GlobalState>()(
  temporal(
    immer((set) => ({
      fontData: null,
      projectId: null,
      projectTitle: '',
      isDirty: false,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
      hasLocalChanges: false,
      localDirtyGlyphIds: [],
      localDeletedGlyphIds: [],
      editorGlyphIds: [],
      editorText: '',
      editorTextCursorIndex: 0,
      editorActiveGlyphIndex: 0,
      previewGlyphMetrics: null,
      idsDictionary: IDS_DICTIONARY,
      currentSearchQuery: '',
      filteredGlyphList: [],
      selectedGlyphId: null,
      selectedLayerId: 'default',
      selectedNodeIds: [],
      selectedSegment: null,
      workspaceView: 'overview',
      overviewGroupBy: 'script',
      overviewSectionId: 'all',
      overviewGridState: null,
      overviewTopGlyphId: null,
      viewport: {
        zoom: 0.46,
        pan: { x: 0, y: 30 },
      },

      setSearchQuery: (query) =>
        set((state) => {
          state.currentSearchQuery = query
          syncFilteredGlyphList(state)
        }),

      setSelectedGlyphId: (id) =>
        set((state) => {
          state.selectedGlyphId = id
          state.selectedNodeIds = []
          state.selectedSegment = null
          if (id) {
            syncGlyphTopLevelFromLayer(
              state.fontData?.glyphs[id],
              state.selectedLayerId
            )
          }
        }),

      addGlyphToEditor: (id) =>
        set((state) => {
          if (!state.fontData?.glyphs[id]) {
            return
          }
          if (!state.editorGlyphIds.includes(id)) {
            state.editorGlyphIds.push(id)
          }
          const glyphIndex = state.editorGlyphIds.indexOf(id)
          syncEditorTextFromGlyphIds(state)
          state.editorActiveGlyphIndex = Math.max(0, glyphIndex)
          state.editorTextCursorIndex = glyphIndex + 1
          state.selectedGlyphId = id
          state.selectedNodeIds = []
          state.selectedSegment = null
          syncGlyphTopLevelFromLayer(
            state.fontData?.glyphs[id],
            state.selectedLayerId
          )
        }),

      insertGlyphIntoEditor: (id, afterGlyphId = null) =>
        set((state) => {
          if (!state.fontData?.glyphs[id]) {
            return
          }

          const existingIndex = state.editorGlyphIds.indexOf(id)
          if (existingIndex >= 0) {
            state.editorGlyphIds.splice(existingIndex, 1)
          }

          const anchorIndex = afterGlyphId
            ? state.editorGlyphIds.indexOf(afterGlyphId)
            : -1
          const insertIndex =
            anchorIndex >= 0 ? anchorIndex + 1 : state.editorGlyphIds.length
          state.editorGlyphIds.splice(insertIndex, 0, id)
          syncEditorTextFromGlyphIds(state)
          state.editorActiveGlyphIndex = insertIndex
          syncSelectedGlyphFromEditorLine(state)
          state.editorTextCursorIndex = insertIndex + 1
          state.selectedNodeIds = []
          state.selectedSegment = null
          if (state.selectedGlyphId) {
            syncGlyphTopLevelFromLayer(
              state.fontData?.glyphs[state.selectedGlyphId],
              state.selectedLayerId
            )
          }
        }),

      removeGlyphFromEditor: (id) =>
        set((state) => {
          const index = state.editorGlyphIds.indexOf(id)
          if (index < 0) {
            return
          }

          state.editorGlyphIds.splice(index, 1)
          syncEditorTextFromGlyphIds(state)
          state.editorTextCursorIndex = clampEditorCursorIndex(
            state,
            state.editorTextCursorIndex
          )
          if (state.selectedGlyphId === id) {
            state.editorActiveGlyphIndex = Math.max(0, index - 1)
            syncSelectedGlyphFromEditorLine(state)
            state.selectedNodeIds = []
            state.selectedSegment = null
            if (state.selectedGlyphId) {
              syncGlyphTopLevelFromLayer(
                state.fontData?.glyphs[state.selectedGlyphId],
                state.selectedLayerId
              )
            }
          }
        }),

      setEditorTextCursorIndex: (index) =>
        set((state) => {
          state.editorTextCursorIndex = clampEditorCursorIndex(state, index)
        }),

      setEditorActiveGlyphIndex: (index) =>
        set((state) => {
          state.editorActiveGlyphIndex = clampEditorActiveGlyphIndex(
            state,
            index
          )
          syncSelectedGlyphFromEditorLine(state)
          state.selectedNodeIds = []
          state.selectedSegment = null
          if (state.selectedGlyphId) {
            syncGlyphTopLevelFromLayer(
              state.fontData?.glyphs[state.selectedGlyphId],
              state.selectedLayerId
            )
          }
        }),

      setEditorTextState: (text, glyphIds, cursorIndex, activeGlyphIndex) =>
        set((state) => {
          state.editorText = text
          state.editorGlyphIds = glyphIds
          state.editorTextCursorIndex = clampEditorCursorIndex(
            state,
            cursorIndex
          )
          state.editorActiveGlyphIndex = clampEditorActiveGlyphIndex(
            state,
            activeGlyphIndex ?? Math.max(0, state.editorTextCursorIndex - 1)
          )
          syncSelectedGlyphFromEditorLine(state)
          state.selectedNodeIds = []
          state.selectedSegment = null
          if (state.selectedGlyphId) {
            syncGlyphTopLevelFromLayer(
              state.fontData?.glyphs[state.selectedGlyphId],
              state.selectedLayerId
            )
          }
        }),

      setWorkspaceView: (view) =>
        set((state) => {
          state.workspaceView = view
          state.selectedNodeIds = []
          state.selectedSegment = null
        }),

      setOverviewGrouping: (groupBy) =>
        set((state) => {
          state.overviewGroupBy = groupBy
        }),

      setOverviewSectionId: (sectionId) =>
        set((state) => {
          state.overviewSectionId = sectionId
        }),

      setOverviewGridState: (gridState) =>
        set((state) => {
          state.overviewGridState = gridState
        }),

      setOverviewTopGlyphId: (glyphId) =>
        set((state) => {
          state.overviewTopGlyphId = glyphId
        }),

      deleteGlyph: (glyphId) =>
        set((state) => {
          if (!state.fontData?.glyphs[glyphId]) {
            return
          }

          delete state.fontData.glyphs[glyphId]
          state.editorGlyphIds = state.editorGlyphIds.filter(
            (id) => id !== glyphId
          )
          syncEditorTextFromGlyphIds(state)
          state.editorTextCursorIndex = clampEditorCursorIndex(
            state,
            state.editorTextCursorIndex
          )
          if (state.selectedGlyphId === glyphId) {
            const fallbackGlyphId =
              state.editorGlyphIds[
                Math.max(0, state.editorTextCursorIndex - 1)
              ] ??
              state.editorGlyphIds[0] ??
              Object.keys(state.fontData.glyphs)[0] ??
              null
            state.selectedGlyphId = fallbackGlyphId
            state.editorActiveGlyphIndex = state.editorGlyphIds.indexOf(
              fallbackGlyphId ?? ''
            )
            if (state.editorActiveGlyphIndex < 0) {
              state.editorActiveGlyphIndex = 0
            }
          }
          state.selectedNodeIds = []
          state.selectedSegment = null
          state.isDirty = true
          state.hasLocalChanges = true
          state.dirtyGlyphIds = state.dirtyGlyphIds.filter(
            (id) => id !== glyphId
          )
          state.localDirtyGlyphIds = state.localDirtyGlyphIds.filter(
            (id) => id !== glyphId
          )
          if (!state.deletedGlyphIds.includes(glyphId)) {
            state.deletedGlyphIds.push(glyphId)
          }
          if (!state.localDeletedGlyphIds.includes(glyphId)) {
            state.localDeletedGlyphIds.push(glyphId)
          }
          syncFilteredGlyphList(state)
        }),

      addGlyphs: (glyphs) => {
        const addedGlyphIds: string[] = []
        set((state) => {
          if (!state.fontData || glyphs.length === 0) {
            return
          }

          const defaultWidth =
            Object.values(state.fontData.glyphs)[0]?.metrics.width ?? 1000

          for (const glyphInput of glyphs) {
            if (state.fontData.glyphs[glyphInput.id]) {
              continue
            }

            const width = glyphInput.width ?? defaultWidth
            state.fontData.glyphs[glyphInput.id] = {
              id: glyphInput.id,
              name: glyphInput.name,
              unicode: glyphInput.unicode,
              paths: [],
              components: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: {
                width,
                lsb: 0,
                rsb: width,
              },
              activeLayerId: state.selectedLayerId ?? 'public.default',
            }
            addedGlyphIds.push(glyphInput.id)
          }

          if (addedGlyphIds.length === 0) {
            return
          }

          state.isDirty = true
          state.hasLocalChanges = true
          for (const glyphId of addedGlyphIds) {
            if (!state.dirtyGlyphIds.includes(glyphId)) {
              state.dirtyGlyphIds.push(glyphId)
            }
            if (!state.localDirtyGlyphIds.includes(glyphId)) {
              state.localDirtyGlyphIds.push(glyphId)
            }
            state.deletedGlyphIds = state.deletedGlyphIds.filter(
              (deletedId) => deletedId !== glyphId
            )
            state.localDeletedGlyphIds = state.localDeletedGlyphIds.filter(
              (deletedId) => deletedId !== glyphId
            )
          }
          syncFilteredGlyphList(state)
          state.selectedGlyphId = addedGlyphIds[0] ?? state.selectedGlyphId
        })
        return addedGlyphIds
      },

      setSelectedNodeIds: (ids) =>
        set((state) => {
          state.selectedNodeIds = ids
          if (ids.length > 0) {
            state.selectedSegment = null
          }
        }),

      setSelectedSegment: (segment) =>
        set((state) => {
          state.selectedSegment = segment
          if (segment) {
            state.selectedNodeIds = []
          }
        }),

      setSelectedLayerId: (id) =>
        set((state) => {
          state.selectedLayerId = id
          state.selectedNodeIds = []
          state.selectedSegment = null
          if (state.selectedGlyphId) {
            syncGlyphTopLevelFromLayer(
              state.fontData?.glyphs[state.selectedGlyphId],
              state.selectedLayerId
            )
          }
          useStore.temporal.getState().clear()
        }),

      updateViewport: (zoom, panX, panY) =>
        set((state) => {
          state.viewport.zoom = Math.min(800, Math.max(0.1, zoom))
          state.viewport.pan = { x: panX, y: panY }
        }),

      updateNodePosition: (glyphId, pathId, nodeId, newPos) =>
        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          if (!glyph) {
            return
          }

          const node = findNode(findPath(glyph, pathId), nodeId)
          if (!node) {
            return
          }

          node.x = Math.round(newPos.x)
          node.y = Math.round(newPos.y)
          recomputeGlyphSidebearings(glyph)
          markGlyphDirty(state, glyphId)
        }),

      updateNodePositions: (glyphId, updates) =>
        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          if (!glyph) {
            return
          }

          for (const update of updates) {
            const node = findNode(findPath(glyph, update.pathId), update.nodeId)
            if (!node) {
              continue
            }

            node.x = Math.round(update.newPos.x)
            node.y = Math.round(update.newPos.y)
          }
          recomputeGlyphSidebearings(glyph)
          markGlyphDirty(state, glyphId)
        }),

      updateNodeType: (glyphId, pathId, nodeId, type) =>
        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          if (!glyph) {
            return
          }

          const path = findPath(glyph, pathId)
          const node = findNode(path, nodeId)
          if (node) {
            if (node.type === 'offcurve' || node.type === 'qcurve') {
              return
            }

            if (type === 'smooth' && path && isPathEndpointNode(path, nodeId)) {
              node.type = 'corner'
              return
            }

            node.type = type
            markGlyphDirty(state, glyphId)
          }
        }),

      updateGlyphMetrics: (glyphId, metrics) =>
        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          if (!glyph) {
            return
          }

          if (typeof metrics.lsb === 'number') {
            const nextLsb = Math.round(metrics.lsb)
            const deltaX = nextLsb - glyph.metrics.lsb
            translateGlyphHorizontally(glyph, deltaX)
            glyph.metrics.width = Math.max(
              0,
              Math.round(glyph.metrics.width + deltaX)
            )
            glyph.metrics.lsb = nextLsb
          }

          if (typeof metrics.width === 'number') {
            glyph.metrics.width = Math.max(0, Math.round(metrics.width))
            const bounds = getGlyphXBounds(glyph)
            glyph.metrics.rsb = Math.round(
              glyph.metrics.width - (bounds?.xMax ?? 0)
            )
          }

          if (typeof metrics.rsb === 'number') {
            const nextRsb = Math.round(metrics.rsb)
            const bounds = getGlyphXBounds(glyph)
            glyph.metrics.width = Math.max(
              0,
              Math.round((bounds?.xMax ?? 0) + nextRsb)
            )
            glyph.metrics.rsb = nextRsb
          }

          markGlyphDirty(state, glyphId)
        }),

      createPath: (glyphId, path) =>
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

      appendNodesToPath: (glyphId, pathId, nodes, prepend = false) =>
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

      replacePathNodes: (glyphId, pathId, startNodeId, endNodeId, nodes) =>
        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          const path = glyph ? findPath(glyph, pathId) : undefined
          if (!path) {
            return
          }

          const startIndex = path.nodes.findIndex(
            (node) => node.id === startNodeId
          )
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

      replacePathWithOpenPieces: (glyphId, pathId, pieces) =>
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

      closePath: (glyphId, pathId) =>
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
        glyphId,
        sourcePathId,
        sourceNodeId,
        targetPathId,
        targetNodeId
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

      reconnectSelectedNodes: (glyphId, selectedNodeIds) => {
        let nextSelection: string[] = []

        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          if (!glyph || selectedNodeIds.length < 2) {
            return
          }

          const closedReconnectSelection = reconnectFourClosedNodes(
            glyph,
            selectedNodeIds
          )
          if (closedReconnectSelection.length > 0) {
            nextSelection = closedReconnectSelection
            state.selectedNodeIds = nextSelection
            state.selectedSegment = null
            markGlyphDirty(state, glyphId)
            return
          }

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
                endpoint:
                  nodeIndex === 0 ? ('start' as const) : ('end' as const),
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
            glyph.paths = glyph.paths.filter(
              (path) => path.id !== target.pathId
            )
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

      convertLineSegmentToCurve: (glyphId, pathId, startNodeId, endNodeId) =>
        set((state) => {
          const glyph = state.fontData?.glyphs[glyphId]
          const path = glyph ? findPath(glyph, pathId) : undefined
          if (!glyph || !path) {
            return
          }

          const startIndex = path.nodes.findIndex(
            (node) => node.id === startNodeId
          )
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

      deleteSelectedNodes: (glyphId, selectedNodeIds) =>
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

      loadProjectState: (
        id,
        title,
        fontData,
        projectMetadata = null,
        projectSourceFormat = null,
        projectRoundTripFormat = null
      ) =>
        set((state) => {
          const hotFontData = ingestProjectData(
            fontData,
            projectMetadata,
            projectSourceFormat,
            projectRoundTripFormat
          )
          state.projectId = id
          state.projectTitle = title
          state.fontData = hotFontData
          state.isDirty = false
          state.dirtyGlyphIds = []
          state.deletedGlyphIds = []
          state.hasLocalChanges = false
          state.localDirtyGlyphIds = []
          state.localDeletedGlyphIds = []
          state.editorGlyphIds = []
          state.editorText = ''
          state.editorTextCursorIndex = 0
          state.editorActiveGlyphIndex = 0
          state.workspaceView = 'overview'
          state.overviewGroupBy = 'script'
          state.overviewSectionId = 'all'
          state.overviewGridState = null
          state.overviewTopGlyphId = null
          const firstGlyph = Object.values(hotFontData.glyphs)[0]
          const firstMasterId = getProjectArchiveFirstMasterId()
          state.selectedLayerId =
            (firstMasterId &&
            firstGlyph &&
            getArchivedGlyphLayer(firstGlyph.id, firstMasterId)
              ? firstMasterId
              : null) ||
            (firstGlyph
              ? (getArchivedGlyphLayer(firstGlyph.id, null)?.id ?? null)
              : null) ||
            null
          syncFilteredGlyphList(state)

          if (
            state.selectedGlyphId &&
            !hotFontData.glyphs[state.selectedGlyphId]
          ) {
            state.selectedGlyphId = Object.keys(hotFontData.glyphs)[0] ?? null
            state.selectedNodeIds = []
            state.selectedSegment = null
          } else if (!state.selectedGlyphId) {
            state.selectedGlyphId = Object.keys(hotFontData.glyphs)[0] ?? null
          }
          if (state.selectedGlyphId) {
            state.editorGlyphIds = [state.selectedGlyphId]
            syncEditorTextFromGlyphIds(state)
            state.editorTextCursorIndex = 1
            state.editorActiveGlyphIndex = 0
            syncGlyphTopLevelFromLayer(
              state.fontData?.glyphs[state.selectedGlyphId],
              state.selectedLayerId
            )
          }
        }),

      hydratePersistedLocalChanges: (dirtyGlyphIds, deletedGlyphIds) =>
        set((state) => {
          state.localDirtyGlyphIds = [...dirtyGlyphIds]
          state.localDeletedGlyphIds = [...deletedGlyphIds]
          state.hasLocalChanges =
            dirtyGlyphIds.length > 0 || deletedGlyphIds.length > 0
        }),

      closeProjectState: () =>
        set((state) => {
          state.fontData = null
          state.projectId = null
          state.projectTitle = ''
          state.isDirty = false
          state.dirtyGlyphIds = []
          state.deletedGlyphIds = []
          state.hasLocalChanges = false
          state.localDirtyGlyphIds = []
          state.localDeletedGlyphIds = []
          state.editorGlyphIds = []
          state.editorText = ''
          state.editorTextCursorIndex = 0
          state.editorActiveGlyphIndex = 0
          state.previewGlyphMetrics = null
          state.filteredGlyphList = []
          state.selectedNodeIds = []
          state.selectedSegment = null
          state.selectedLayerId = null
          state.workspaceView = 'overview'
          state.overviewGroupBy = 'script'
          state.overviewSectionId = 'all'
          state.overviewGridState = null
          state.overviewTopGlyphId = null
          clearProjectArchive()
          useStore.temporal.getState().clear()
        }),

      markDraftSaved: () =>
        set((state) => {
          state.isDirty = false
          state.dirtyGlyphIds = []
          state.deletedGlyphIds = []
        }),

      markLocalSaved: () =>
        set((state) => {
          state.hasLocalChanges = false
          state.localDirtyGlyphIds = []
          state.localDeletedGlyphIds = []
        }),

      setPreviewGlyphMetrics: (glyphId, metrics) =>
        set((state) => {
          state.previewGlyphMetrics = { glyphId, metrics }
        }),

      clearPreviewGlyphMetrics: (glyphId) =>
        set((state) => {
          if (!glyphId || state.previewGlyphMetrics?.glyphId === glyphId) {
            state.previewGlyphMetrics = null
          }
        }),
    })),
    {
      partialize: (state) => ({ fontData: state.fontData }),
      equality: (pastState, currentState) =>
        pastState.fontData === currentState.fontData,
      limit: 50,
    }
  )
)

export const useTemporalStore = <T>(
  selector: (state: TemporalState<unknown>) => T
): T =>
  useSyncExternalStore(
    useStore.temporal.subscribe,
    () => selector(useStore.temporal.getState()),
    () => selector(useStore.temporal.getState())
  )
