/**
 * UI-related store actions: editor text, glyph selection, workspace view,
 * overview panel, viewport, and preview glyph metrics.
 */
import type { StateCreator } from 'zustand'
import type { GlobalState, GlyphMetrics, PathData } from 'src/store/types'
import {
  clampEditorActiveGlyphIndex,
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
  syncSelectedGlyphFromEditorLine,
} from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import { setGlyphActiveLayer } from 'src/store/glyphLayer'
import { markUiStateDirty } from 'src/store/dirtyState'
import {
  customOverviewFilterIdToNodeId,
  normalizeOverviewCustomFilters,
} from 'src/lib/glyph/glyphOverview'
import { saveAppOverviewCustomFilters } from 'src/lib/preferences/appPreferences'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

const createOverviewCustomFilterId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `overview-filter-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export const buildUiActions = (set: ImmerSet) => ({
  setSearchQuery: (query: string) =>
    set((state) => {
      state.currentSearchQuery = query
      syncFilteredGlyphList(state)
    }),

  setOverviewSearchOptions: (
    options: Partial<GlobalState['overviewSearchOptions']>
  ) =>
    set((state) => {
      state.overviewSearchOptions = {
        ...state.overviewSearchOptions,
        ...options,
      }
      syncFilteredGlyphList(state)
    }),

  addOverviewCustomFilter: (
    filter: Omit<GlobalState['overviewCustomFilters'][number], 'id'> & {
      id?: string
    }
  ) => {
    const filterId = filter.id ?? createOverviewCustomFilterId()
    set((state) => {
      const nextFilter = {
        ...filter,
        id: filterId,
        sort: filter.sort ?? 'codePoint',
        source: filter.source ?? 'user',
      }
      const normalizedFilter =
        normalizeOverviewCustomFilters([nextFilter])[0] ?? nextFilter
      state.overviewCustomFilters = saveAppOverviewCustomFilters([
        ...state.overviewCustomFilters,
        normalizedFilter,
      ])
      state.overviewSectionId = customOverviewFilterIdToNodeId(filterId)
    })
    return filterId
  },

  updateOverviewCustomFilter: (
    filter: GlobalState['overviewCustomFilters'][number]
  ) =>
    set((state) => {
      const index = state.overviewCustomFilters.findIndex(
        (current) => current.id === filter.id
      )
      if (index < 0) {
        return
      }
      const normalizedFilter =
        normalizeOverviewCustomFilters([filter])[0] ?? filter
      state.overviewCustomFilters = saveAppOverviewCustomFilters(
        state.overviewCustomFilters.map((currentFilter, currentIndex) =>
          currentIndex === index ? normalizedFilter : currentFilter
        )
      )
    }),

  deleteOverviewCustomFilter: (filterId: string) =>
    set((state) => {
      state.overviewCustomFilters = saveAppOverviewCustomFilters(
        state.overviewCustomFilters.filter((filter) => filter.id !== filterId)
      )
      if (
        state.overviewSectionId === customOverviewFilterIdToNodeId(filterId)
      ) {
        state.overviewSectionId = 'filters'
      }
    }),

  // Rebuild the overview list against the current fontData. Needed after an
  // undo/redo, which restores fontData but leaves filteredGlyphList (not part
  // of the temporal partialize set) holding stale glyph references.
  refreshFilteredGlyphList: () =>
    set((state) => {
      syncFilteredGlyphList(state)
    }),

  setSelectedGlyphId: (id: string | null) =>
    set((state) => {
      state.selectedGlyphId = id
      state.selectedNodeIds = []
      state.selectedSegment = null
      if (id) {
        setGlyphActiveLayer(state.fontData?.glyphs[id], state.selectedLayerId)
      }
      markUiStateDirty(state)
    }),

  // Master switch is the discrete special case of setting editLocation: snap the
  // current design-space position to the source's location.
  setReferenceFontName: (name: string | null) =>
    set((state) => {
      state.referenceFontName = name
    }),

  setReferenceFontVisible: (visible: boolean) =>
    set((state) => {
      state.referenceFontVisible = visible
    }),

  setReferenceFontChar: (char: string | null) =>
    set((state) => {
      state.referenceFontChar = char
    }),

  toggleBackdropLayer: (layerId: string) =>
    set((state) => {
      const ids = state.visibleBackdropLayerIds
      state.visibleBackdropLayerIds = ids.includes(layerId)
        ? ids.filter((id) => id !== layerId)
        : [...ids, layerId]
    }),

  toggleActiveLayerHidden: () =>
    set((state) => {
      state.hideActiveLayer = !state.hideActiveLayer
    }),

  addGlyphToEditor: (id: string) =>
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
      setGlyphActiveLayer(state.fontData?.glyphs[id], state.selectedLayerId)
      markUiStateDirty(state)
    }),

  insertGlyphIntoEditor: (id: string, afterGlyphId: string | null = null) =>
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
        setGlyphActiveLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
      markUiStateDirty(state)
    }),

  removeGlyphFromEditor: (id: string) =>
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
          setGlyphActiveLayer(
            state.fontData?.glyphs[state.selectedGlyphId],
            state.selectedLayerId
          )
        }
      }
      markUiStateDirty(state)
    }),

  setEditorTextCursorIndex: (index: number) =>
    set((state) => {
      state.editorTextCursorIndex = clampEditorCursorIndex(state, index)
    }),

  setEditorActiveGlyphIndex: (index: number) =>
    set((state) => {
      state.editorActiveGlyphIndex = clampEditorActiveGlyphIndex(state, index)
      syncSelectedGlyphFromEditorLine(state)
      state.selectedNodeIds = []
      state.selectedSegment = null
      if (state.selectedGlyphId) {
        setGlyphActiveLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
      markUiStateDirty(state)
    }),

  setEditorTextState: (
    text: string,
    glyphIds: string[],
    cursorIndex: number,
    activeGlyphIndex?: number | null
  ) =>
    set((state) => {
      state.editorText = text
      state.editorGlyphIds = glyphIds
      state.editorTextCursorIndex = clampEditorCursorIndex(state, cursorIndex)
      state.editorActiveGlyphIndex = clampEditorActiveGlyphIndex(
        state,
        activeGlyphIndex ?? Math.max(0, state.editorTextCursorIndex - 1)
      )
      syncSelectedGlyphFromEditorLine(state)
      state.selectedNodeIds = []
      state.selectedSegment = null
      if (state.selectedGlyphId) {
        setGlyphActiveLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
      markUiStateDirty(state)
    }),

  setWorkspaceView: (view: GlobalState['workspaceView']) =>
    set((state) => {
      state.workspaceView = view
      state.selectedNodeIds = []
      state.selectedSegment = null
      markUiStateDirty(state)
    }),

  setDesignspaceScrubbing: (isScrubbing: boolean) =>
    set((state) => {
      state.isDesignspaceScrubbing = isScrubbing
    }),

  setOverviewGrouping: (groupBy: GlobalState['overviewGroupBy']) =>
    set((state) => {
      state.overviewGroupBy = groupBy
      markUiStateDirty(state)
    }),

  setOverviewSectionId: (sectionId: string) =>
    set((state) => {
      state.overviewSectionId = sectionId
      markUiStateDirty(state)
    }),

  setOverviewGridState: (gridState: GlobalState['overviewGridState']) =>
    set((state) => {
      state.overviewGridState = gridState
      markUiStateDirty(state)
    }),

  setOverviewTopGlyphId: (glyphId: string | null) =>
    set((state) => {
      state.overviewTopGlyphId = glyphId
      markUiStateDirty(state)
    }),

  setSelectedNodeIds: (ids: string[]) =>
    set((state) => {
      state.selectedNodeIds = ids
      if (ids.length > 0) {
        state.selectedSegment = null
      }
    }),

  setSelectedSegment: (segment: GlobalState['selectedSegment']) =>
    set((state) => {
      state.selectedSegment = segment
      if (segment) {
        state.selectedNodeIds = []
      }
    }),

  updateViewport: (zoom: number, panX: number, panY: number) =>
    set((state) => {
      // Clamp range must match CanvasController MIN/MAX_MAGNIFICATION,
      // otherwise the mirrored value diverges from the canvas state.
      state.viewport.zoom = Math.min(800, Math.max(0.005, zoom))
      state.viewport.pan = { x: panX, y: panY }
    }),

  setPreviewGlyphMetrics: (glyphId: string, metrics: GlyphMetrics) =>
    set((state) => {
      state.previewGlyphMetrics = { glyphId, metrics }
    }),

  clearPreviewGlyphMetrics: (glyphId?: string | null) =>
    set((state) => {
      if (!glyphId || state.previewGlyphMetrics?.glyphId === glyphId) {
        state.previewGlyphMetrics = null
      }
    }),

  setComponentGhostPaths: (paths: PathData[] | null) =>
    set((state) => {
      state.componentGhostPaths = paths
    }),

  setComponentTargetRect: (
    rect: { xMin: number; yMin: number; xMax: number; yMax: number } | null
  ) =>
    set((state) => {
      state.componentTargetRect = rect
    }),
})
