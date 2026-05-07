/**
 * Glyph-level store actions: add/delete glyphs, update node positions/types,
 * update glyph metrics.
 */
import type { StateCreator } from 'zustand'
import type { GlobalState, GlyphMetrics, NodeType } from 'src/store/types'
import {
  findNode,
  findPath,
  getGlyphXBounds,
  isPathEndpointNode,
  translateGlyphHorizontally,
  recomputeGlyphSidebearings,
} from 'src/store/glyphGeometry'
import {
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
} from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import { syncGlyphTopLevelFromLayer } from 'src/store/glyphLayer'
import { markGlyphDirty } from 'src/store/dirtyState'

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
      state.isDirty = true
      state.hasLocalChanges = true
      state.dirtyGlyphIds = state.dirtyGlyphIds.filter((id) => id !== glyphId)
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

  addGlyphs: (
    glyphs: Array<{
      id: string
      name: string
      unicode: string | null
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
})
