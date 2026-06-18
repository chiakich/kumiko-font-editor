/**
 * Project-level store actions: load, close, hydrate, and mark save state.
 */
import type { StateCreator } from 'zustand'
import type { FontData, GlobalState } from 'src/store/types'
import {
  clearProjectArchive,
  getProjectArchiveFirstMasterId,
  ingestProjectData,
} from 'src/lib/project/projectArchive'
import type {
  ProjectSourceFormat,
  ProjectRoundTripFormat,
} from 'src/lib/project/projectFormats'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { getProjectGlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { syncEditorTextFromGlyphIds } from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import {
  getGlyphLayer,
  getActiveLayerId,
  setGlyphActiveLayer,
} from 'src/store/glyphLayer'
import { markProjectDirty } from 'src/store/dirtyState'

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
      state.persistenceStatus = 'idle'
      state.persistenceError = null
      state.dirtyGlyphIds = []
      state.deletedGlyphIds = []
      state.hasLocalChanges = false
      state.localDirtyGlyphIds = []
      state.localDeletedGlyphIds = []
      state.glyphEditTimes = getProjectGlyphEditTimes(projectMetadata)
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
        (firstMasterId && firstGlyph && getGlyphLayer(firstGlyph, firstMasterId)
          ? firstMasterId
          : null) ||
        (firstGlyph ? getActiveLayerId(firstGlyph) : null) ||
        null
      // Multi-master: when the selected layer is a font source, treat it as the
      // active master so the switcher highlights it.
      state.activeMasterId =
        state.selectedLayerId && hotFontData.sources?.[state.selectedLayerId]
          ? state.selectedLayerId
          : null
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
        setGlyphActiveLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
    }),

  hydratePersistedLocalChanges: (
    dirtyGlyphIds: string[],
    deletedGlyphIds: string[],
    glyphEditTimes: GlyphEditTimes = {}
  ) =>
    set((state) => {
      state.localDirtyGlyphIds = [...dirtyGlyphIds]
      state.localDeletedGlyphIds = [...deletedGlyphIds]
      state.glyphEditTimes = {
        ...state.glyphEditTimes,
        ...glyphEditTimes,
      }
      state.hasLocalChanges =
        dirtyGlyphIds.length > 0 || deletedGlyphIds.length > 0
    }),

  closeProjectState: () =>
    set((state) => {
      state.fontData = null
      state.projectId = null
      state.projectTitle = ''
      state.isDirty = false
      state.persistenceStatus = 'idle'
      state.persistenceError = null
      state.dirtyGlyphIds = []
      state.deletedGlyphIds = []
      state.hasLocalChanges = false
      state.localDirtyGlyphIds = []
      state.localDeletedGlyphIds = []
      state.glyphEditTimes = {}
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

  // Pass the ids that were actually persisted so edits made during an async
  // save are not cleared; omit both to clear everything (full save/commit).
  markDraftSaved: (savedDirtyIds?: string[], savedDeletedIds?: string[]) =>
    set((state) => {
      if (!savedDirtyIds && !savedDeletedIds) {
        state.isDirty = false
        state.dirtyGlyphIds = []
        state.deletedGlyphIds = []
        return
      }
      const savedDirty = new Set(savedDirtyIds ?? [])
      const savedDeleted = new Set(savedDeletedIds ?? [])
      state.dirtyGlyphIds = state.dirtyGlyphIds.filter(
        (id) => !savedDirty.has(id)
      )
      state.deletedGlyphIds = state.deletedGlyphIds.filter(
        (id) => !savedDeleted.has(id)
      )
      state.isDirty =
        state.dirtyGlyphIds.length > 0 || state.deletedGlyphIds.length > 0
    }),

  setPersistenceStatus: (
    status: GlobalState['persistenceStatus'],
    error: string | null = null
  ) =>
    set((state) => {
      state.persistenceStatus = status
      state.persistenceError = error
    }),

  markLocalSaved: () =>
    set((state) => {
      state.hasLocalChanges = false
      state.localDirtyGlyphIds = []
      state.localDeletedGlyphIds = []
    }),

  updateFontInfo: (update: {
    fontInfo: FontData['fontInfo']
    unitsPerEm?: number
  }) =>
    set((state) => {
      if (!state.fontData || !update.fontInfo) {
        return
      }

      state.fontData.fontInfo = update.fontInfo
      if (update.unitsPerEm !== undefined) {
        state.fontData.unitsPerEm = update.unitsPerEm
      }
      markProjectDirty(state)
    }),

  updateFontSettings: (fontDataUpdate: Partial<FontData>) =>
    set((state) => {
      if (!state.fontData) {
        return
      }

      const prevSources = state.fontData.sources ?? {}
      state.fontData = {
        ...state.fontData,
        ...fontDataUpdate,
        glyphs: state.fontData.glyphs,
      }

      // Keep per-glyph master layers consistent with source CRUD: drop layers for
      // removed sources, and follow source renames into the layer display name.
      if (fontDataUpdate.sources) {
        const nextSources = fontDataUpdate.sources
        const removed = Object.keys(prevSources).filter(
          (id) => !nextSources[id]
        )
        const renamed = Object.keys(nextSources).filter(
          (id) =>
            prevSources[id] && prevSources[id].name !== nextSources[id].name
        )
        if (removed.length > 0 || renamed.length > 0) {
          const removedSet = new Set(removed)
          for (const glyph of Object.values(state.fontData.glyphs)) {
            if (!glyph.layers) {
              continue
            }
            for (const id of removed) {
              delete glyph.layers[id]
            }
            for (const id of renamed) {
              if (glyph.layers[id]) {
                glyph.layers[id].name = nextSources[id].name
              }
            }
            if (glyph.layerOrder) {
              glyph.layerOrder = glyph.layerOrder.filter(
                (id) => !removedSet.has(id)
              )
            }
            if (glyph.activeLayerId && removedSet.has(glyph.activeLayerId)) {
              glyph.activeLayerId =
                glyph.layerOrder?.[0] ?? Object.keys(glyph.layers)[0] ?? null
            }
          }
          if (state.activeMasterId && removedSet.has(state.activeMasterId)) {
            state.activeMasterId = Object.keys(nextSources)[0] ?? null
            state.selectedLayerId = state.activeMasterId
          }
        }
      }

      markProjectDirty(state)
    }),
})
