/**
 * UI-related store actions: editor text, glyph selection, workspace view,
 * overview panel, viewport, and preview glyph metrics.
 */
import type { StateCreator } from 'zustand'
import type { GlobalState, GlyphMetrics } from 'src/store/types'
import {
  clampEditorActiveGlyphIndex,
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
  syncSelectedGlyphFromEditorLine,
} from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import { syncGlyphTopLevelFromLayer } from 'src/store/glyphLayer'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

export const buildUiActions = (set: ImmerSet) => ({
  setSearchQuery: (query: string) =>
    set((state) => {
      state.currentSearchQuery = query
      syncFilteredGlyphList(state)
    }),

  setSelectedGlyphId: (id: string | null) =>
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
      syncGlyphTopLevelFromLayer(
        state.fontData?.glyphs[id],
        state.selectedLayerId
      )
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
        syncGlyphTopLevelFromLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
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
          syncGlyphTopLevelFromLayer(
            state.fontData?.glyphs[state.selectedGlyphId],
            state.selectedLayerId
          )
        }
      }
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
        syncGlyphTopLevelFromLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
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
        syncGlyphTopLevelFromLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
    }),

  setWorkspaceView: (view: GlobalState['workspaceView']) =>
    set((state) => {
      state.workspaceView = view
      state.selectedNodeIds = []
      state.selectedSegment = null
    }),

  setOverviewGrouping: (groupBy: GlobalState['overviewGroupBy']) =>
    set((state) => {
      state.overviewGroupBy = groupBy
    }),

  setOverviewSectionId: (sectionId: string) =>
    set((state) => {
      state.overviewSectionId = sectionId
    }),

  setOverviewGridState: (gridState: GlobalState['overviewGridState']) =>
    set((state) => {
      state.overviewGridState = gridState
    }),

  setOverviewTopGlyphId: (glyphId: string | null) =>
    set((state) => {
      state.overviewTopGlyphId = glyphId
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
      state.viewport.zoom = Math.min(800, Math.max(0.1, zoom))
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
})
