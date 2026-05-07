/**
 * Project-level store actions: load, close, hydrate, and mark save state.
 */
import type { StateCreator } from 'zustand'
import type { FontData, GlobalState } from 'src/store/types'
import {
  clearProjectArchive,
  getArchivedGlyphLayer,
  getProjectArchiveFirstMasterId,
  ingestProjectData,
} from 'src/lib/projectArchive'
import type {
  ProjectSourceFormat,
  ProjectRoundTripFormat,
} from 'src/lib/projectFormats'
import { syncEditorTextFromGlyphIds } from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import { syncGlyphTopLevelFromLayer } from 'src/store/glyphLayer'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

export const buildProjectActions = (
  set: ImmerSet,
  clearTemporal: () => void
) => ({
  loadProjectState: (
    id: string,
    title: string,
    fontData: FontData,
    projectMetadata: Record<string, unknown> | null = null,
    projectSourceFormat: ProjectSourceFormat | null = null,
    projectRoundTripFormat: ProjectRoundTripFormat | null = null
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

      if (state.selectedGlyphId && !hotFontData.glyphs[state.selectedGlyphId]) {
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

  hydratePersistedLocalChanges: (
    dirtyGlyphIds: string[],
    deletedGlyphIds: string[]
  ) =>
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
      clearTemporal()
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
})
