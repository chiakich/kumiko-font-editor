/**
 * Glyph-level store actions: add/delete glyphs, update node positions/types,
 * update glyph metrics.
 */
import { current } from 'immer'
import type { StateCreator } from 'zustand'
import type { GlobalState, GlyphMetrics, NodeType } from 'src/store/types'
import {
  createBackupLayer,
  deleteBackupLayer,
  duplicateLayer,
  renameBackupLayer,
  promoteBackupToMaster,
} from 'src/store/glyphLayerOps'
import {
  findNode,
  findPath,
  generateId,
  getGlyphXBounds,
  isPathEndpointNode,
  translateGlyphHorizontally,
  recomputeGlyphSidebearings,
  wouldCreateComponentCycle,
} from 'src/store/glyphGeometry'
import {
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
} from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import { syncGlyphTopLevelFromLayer } from 'src/store/glyphLayer'
import {
  markGlyphAdded,
  markGlyphDeleted,
  markGlyphDirty,
} from 'src/store/dirtyState'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

export const buildGlyphActions = (set: ImmerSet) => ({
  deleteGlyph: (glyphId: string) =>
    set((state) => {
      if (!state.fontData?.glyphs[glyphId]) {
        return
      }

      delete state.fontData.glyphs[glyphId]
      if (state.fontData.glyphOrder) {
        state.fontData.glyphOrder = state.fontData.glyphOrder.filter(
          (id) => id !== glyphId
        )
      }
      state.editorGlyphIds = state.editorGlyphIds.filter((id) => id !== glyphId)
      syncEditorTextFromGlyphIds(state)
      state.editorTextCursorIndex = clampEditorCursorIndex(
        state,
        state.editorTextCursorIndex
      )
      if (state.selectedGlyphId === glyphId) {
        const fallbackGlyphId =
          state.editorGlyphIds[Math.max(0, state.editorTextCursorIndex - 1)] ??
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
      markGlyphDeleted(state, glyphId)
      syncFilteredGlyphList(state)
    }),

  addGlyphs: (
    glyphs: Array<{
      id: string
      name: string
      unicode: string | null
      production?: string | null
      width?: number
    }>
  ) => {
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
        state.fontData.glyphOrder =
          state.fontData.glyphOrder ?? Object.keys(state.fontData.glyphs)
        state.fontData.glyphs[glyphInput.id] = {
          id: glyphInput.id,
          name: glyphInput.name,
          unicode: glyphInput.unicode,
          production: glyphInput.production ?? null,
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
        if (!state.fontData.glyphOrder.includes(glyphInput.id)) {
          state.fontData.glyphOrder.push(glyphInput.id)
        }
        addedGlyphIds.push(glyphInput.id)
      }

      if (addedGlyphIds.length === 0) {
        return
      }

      for (const glyphId of addedGlyphIds) {
        markGlyphAdded(state, glyphId)
      }
      syncFilteredGlyphList(state)
      state.selectedGlyphId = addedGlyphIds[0] ?? state.selectedGlyphId
    })
    return addedGlyphIds
  },

  addComponentRef: (glyphId: string, componentGlyphId: string) => {
    let added = false
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const componentGlyph = state.fontData?.glyphs[componentGlyphId]
      if (!glyph || !componentGlyph || !state.fontData) {
        return
      }
      if (
        wouldCreateComponentCycle(
          state.fontData.glyphs,
          glyphId,
          componentGlyphId
        )
      ) {
        return
      }

      glyph.componentRefs.push({
        id: generateId('component'),
        glyphId: componentGlyphId,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      })
      markGlyphDirty(state, glyphId)
      added = true
    })
    return added
  },

  setSelectedLayerId: (id: string | null, clearTemporal: () => void) =>
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
      clearTemporal()
    }),

  updateNodePosition: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    newPos: { x: number; y: number }
  ) =>
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

  updateNodePositions: (
    glyphId: string,
    updates: Array<{
      pathId: string
      nodeId: string
      newPos: { x: number; y: number }
    }>
  ) =>
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

  updateNodeType: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    type: NodeType
  ) =>
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

  updateGlyphMetrics: (glyphId: string, metrics: Partial<GlyphMetrics>) =>
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

  createBackupLayer: (glyphId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const name = `Backup ${new Date().toLocaleString()}`
      state.fontData!.glyphs[glyphId] = createBackupLayer(
        current(glyph),
        generateId('layer'),
        name
      )
      markGlyphDirty(state, glyphId)
    }),

  duplicateLayer: (glyphId: string, layerId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const sourceName = glyph.layers?.[layerId]?.name ?? 'Master'
      state.fontData!.glyphs[glyphId] = duplicateLayer(
        current(glyph),
        layerId,
        generateId('layer'),
        `${sourceName} copy`
      )
      markGlyphDirty(state, glyphId)
    }),

  deleteBackupLayer: (glyphId: string, layerId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      state.fontData!.glyphs[glyphId] = deleteBackupLayer(
        current(glyph),
        layerId
      )
      markGlyphDirty(state, glyphId)
    }),

  renameBackupLayer: (glyphId: string, layerId: string, name: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      state.fontData!.glyphs[glyphId] = renameBackupLayer(
        current(glyph),
        layerId,
        name
      )
      markGlyphDirty(state, glyphId)
    }),

  promoteBackupToMaster: (glyphId: string, layerId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const name = `Backup ${new Date().toLocaleString()}`
      state.fontData!.glyphs[glyphId] = promoteBackupToMaster(
        current(glyph),
        layerId,
        generateId('layer'),
        name
      )
      state.selectedNodeIds = []
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),
})
