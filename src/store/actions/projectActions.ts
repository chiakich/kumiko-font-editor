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
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'
import { findSourceIdAtLocation } from 'src/font/designspaceLocation'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { getProjectGlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import {
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
} from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import { evictGlyphGeometry } from 'src/store/glyphGeometryEviction'
import {
  getGlyphLayer,
  getActiveLayerId,
  setGlyphActiveLayer,
} from 'src/store/glyphLayer'
import { markProjectDirty } from 'src/store/dirtyState'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

const createEmptyPersistenceQueue = (): GlobalState['persistenceQueue'] => ({
  projectQueued: false,
  uiStateQueued: false,
  glyphIds: [],
  deletedGlyphIds: [],
  revision: 0,
  projectRevision: null,
  uiStateRevision: null,
  glyphRevisions: {},
  deletedGlyphRevisions: {},
  status: 'idle',
  lastError: null,
})

const hasQueuedPersistence = (state: GlobalState) =>
  state.persistenceQueue.projectQueued ||
  state.persistenceQueue.uiStateQueued ||
  state.persistenceQueue.glyphIds.length > 0 ||
  state.persistenceQueue.deletedGlyphIds.length > 0

const syncDirtyListsFromQueue = (state: GlobalState) => {
  state.dirtyGlyphIds = [...state.persistenceQueue.glyphIds]
  state.deletedGlyphIds = [...state.persistenceQueue.deletedGlyphIds]
  state.isDirty = hasQueuedPersistence(state)
}

export const buildProjectActions = (
  set: ImmerSet,
  clearTemporal: () => void,
  withTemporalPaused: (callback: () => void) => void
) => ({
  loadProjectState: (
    id: string,
    title: string,
    fontData: FontData,
    projectMetadata: Record<string, unknown> | null = null,
    projectSourceFormat: ProjectSourceFormat | null = null,
    projectRoundTripFormat: ProjectRoundTripFormat | null = null,
    projectUiState: KumikoProjectUiState | null = null
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
      state.persistenceQueue = createEmptyPersistenceQueue()
      state.dirtyGlyphIds = []
      state.deletedGlyphIds = []
      state.hasLocalChanges = false
      state.localDirtyGlyphIds = []
      state.localDeletedGlyphIds = []
      state.glyphEditTimes = getProjectGlyphEditTimes(projectMetadata)
      state.glyphGeometryAccess = {}
      state.glyphGeometryAccessCounter = 0
      state.editorGlyphIds = []
      state.editorText = ''
      state.editorTextCursorIndex = 0
      state.editorActiveGlyphIndex = 0
      state.workspaceView = 'overview'
      state.overviewGroupBy = 'script'
      state.overviewSectionId = projectUiState?.overviewSectionId ?? 'all'
      state.overviewGridState = projectUiState?.overviewGridState ?? null
      state.overviewTopGlyphId = projectUiState?.overviewTopGlyphId ?? null
      const firstGlyph = Object.values(hotFontData.glyphs)[0]
      const firstMasterId = getProjectArchiveFirstMasterId()
      const firstMasterLayerId =
        firstMasterId && firstGlyph && getGlyphLayer(firstGlyph, firstMasterId)
          ? firstMasterId
          : null
      state.selectedLayerId =
        projectUiState?.selectedLayerId ??
        (firstMasterLayerId ||
          (firstGlyph ? getActiveLayerId(firstGlyph) : null) ||
          null)
      const storedEditLocation = projectUiState?.editLocation ?? null
      // Multi-master: editLocation is the source of truth. A saved location may
      // be between masters, in which case activeMasterId stays null.
      state.activeMasterId = storedEditLocation
        ? findSourceIdAtLocation(hotFontData, storedEditLocation)
        : projectUiState?.activeMasterId &&
            hotFontData.sources?.[projectUiState.activeMasterId]
          ? projectUiState.activeMasterId
          : null
      state.activeMasterId =
        !storedEditLocation &&
        state.selectedLayerId &&
        hotFontData.sources?.[state.selectedLayerId]
          ? state.selectedLayerId
          : state.activeMasterId
      const activeSource = state.activeMasterId
        ? hotFontData.sources?.[state.activeMasterId]
        : null
      state.editLocation = storedEditLocation
        ? { ...storedEditLocation }
        : activeSource
          ? { ...activeSource.location }
          : {}
      syncFilteredGlyphList(state)

      for (const glyph of Object.values(hotFontData.glyphs)) {
        if (isGlyphGeometryLoaded(glyph)) {
          state.glyphGeometryAccessCounter += 1
          state.glyphGeometryAccess[glyph.id] = state.glyphGeometryAccessCounter
        }
      }

      const storedSelectedGlyphId = projectUiState?.selectedGlyphId ?? null
      if (storedSelectedGlyphId && hotFontData.glyphs[storedSelectedGlyphId]) {
        state.selectedGlyphId = storedSelectedGlyphId
      } else if (
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

  hydrateGlyphGeometry: (
    glyphs: FontData['glyphs'][string][],
    options?: { maxLoadedGlyphs?: number }
  ) =>
    withTemporalPaused(() => {
      set((state) => {
        if (!state.fontData || glyphs.length === 0) {
          return
        }

        for (const glyph of glyphs) {
          const existing = state.fontData.glyphs[glyph.id]
          if (!existing) {
            continue
          }
          const activeLayerId =
            existing.activeLayerId && glyph.layers?.[existing.activeLayerId]
              ? existing.activeLayerId
              : glyph.activeLayerId
          state.fontData.glyphs[glyph.id] = {
            ...existing,
            ...glyph,
            activeLayerId,
          }
          state.glyphGeometryAccessCounter += 1
          state.glyphGeometryAccess[glyph.id] = state.glyphGeometryAccessCounter
        }

        evictGlyphGeometry({
          glyphs: state.fontData.glyphs,
          accessByGlyphId: state.glyphGeometryAccess,
          dirtyGlyphIds: state.dirtyGlyphIds,
          localDirtyGlyphIds: state.localDirtyGlyphIds,
          deletedGlyphIds: state.deletedGlyphIds,
          localDeletedGlyphIds: state.localDeletedGlyphIds,
          editorGlyphIds: state.editorGlyphIds,
          selectedGlyphId: state.selectedGlyphId,
          keepGlyphIds: glyphs.map((glyph) => glyph.id),
          maxLoadedGlyphs: options?.maxLoadedGlyphs,
        })

        if (
          state.selectedGlyphId &&
          state.selectedLayerId &&
          state.fontData.glyphs[state.selectedGlyphId]?.layers?.[
            state.selectedLayerId
          ]
        ) {
          setGlyphActiveLayer(
            state.fontData.glyphs[state.selectedGlyphId],
            state.selectedLayerId
          )
        }
        syncFilteredGlyphList(state)
      })
    }),

  hydrateExternalGlyphDeletions: (glyphIds: string[]) =>
    withTemporalPaused(() => {
      set((state) => {
        if (!state.fontData || glyphIds.length === 0) {
          return
        }

        const deletedGlyphIds = new Set(
          glyphIds.filter((glyphId) => Boolean(state.fontData?.glyphs[glyphId]))
        )
        if (deletedGlyphIds.size === 0) {
          return
        }

        for (const glyphId of deletedGlyphIds) {
          delete state.fontData.glyphs[glyphId]
          delete state.glyphGeometryAccess[glyphId]
        }
        state.fontData.glyphOrder = (
          state.fontData.glyphOrder ?? Object.keys(state.fontData.glyphs)
        ).filter((glyphId) => !deletedGlyphIds.has(glyphId))
        state.editorGlyphIds = state.editorGlyphIds.filter(
          (glyphId) => !deletedGlyphIds.has(glyphId)
        )
        syncEditorTextFromGlyphIds(state)
        state.editorTextCursorIndex = clampEditorCursorIndex(
          state,
          state.editorTextCursorIndex
        )
        if (
          state.previewGlyphMetrics &&
          deletedGlyphIds.has(state.previewGlyphMetrics.glyphId)
        ) {
          state.previewGlyphMetrics = null
        }
        if (
          state.selectedGlyphId &&
          deletedGlyphIds.has(state.selectedGlyphId)
        ) {
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
          state.selectedNodeIds = []
          state.selectedSegment = null
        }
        if (state.selectedGlyphId) {
          setGlyphActiveLayer(
            state.fontData.glyphs[state.selectedGlyphId],
            state.selectedLayerId
          )
        }
        syncFilteredGlyphList(state)
      })
    }),

  closeProjectState: () =>
    set((state) => {
      state.fontData = null
      state.projectId = null
      state.projectTitle = ''
      state.isDirty = false
      state.persistenceStatus = 'idle'
      state.persistenceError = null
      state.persistenceQueue = createEmptyPersistenceQueue()
      state.dirtyGlyphIds = []
      state.deletedGlyphIds = []
      state.hasLocalChanges = false
      state.localDirtyGlyphIds = []
      state.localDeletedGlyphIds = []
      state.glyphEditTimes = {}
      state.glyphGeometryAccess = {}
      state.glyphGeometryAccessCounter = 0
      state.editorGlyphIds = []
      state.editorText = ''
      state.editorTextCursorIndex = 0
      state.editorActiveGlyphIndex = 0
      state.previewGlyphMetrics = null
      state.filteredGlyphList = []
      state.selectedNodeIds = []
      state.selectedSegment = null
      state.selectedLayerId = null
      state.activeMasterId = null
      state.editLocation = {}
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
  markDraftSaved: (
    savedDirtyIds?: string[],
    savedDeletedIds?: string[],
    savedRevision?: number
  ) =>
    set((state) => {
      if (!savedDirtyIds && !savedDeletedIds) {
        state.isDirty = false
        state.dirtyGlyphIds = []
        state.deletedGlyphIds = []
        state.persistenceQueue = {
          ...createEmptyPersistenceQueue(),
          revision: state.persistenceQueue.revision,
        }
        return
      }
      const savedDirty = new Set(savedDirtyIds ?? [])
      const savedDeleted = new Set(savedDeletedIds ?? [])
      const canClearRevision = (revision: number | undefined) =>
        savedRevision === undefined || (revision ?? 0) <= savedRevision

      if (!hasQueuedPersistence(state) && savedRevision === undefined) {
        state.dirtyGlyphIds = state.dirtyGlyphIds.filter(
          (id) => !savedDirty.has(id)
        )
        state.deletedGlyphIds = state.deletedGlyphIds.filter(
          (id) => !savedDeleted.has(id)
        )
        state.isDirty =
          state.dirtyGlyphIds.length > 0 || state.deletedGlyphIds.length > 0
        return
      }

      state.persistenceQueue.glyphIds = state.persistenceQueue.glyphIds.filter(
        (id) => {
          if (
            savedDirty.has(id) &&
            canClearRevision(state.persistenceQueue.glyphRevisions[id])
          ) {
            delete state.persistenceQueue.glyphRevisions[id]
            return false
          }
          return true
        }
      )
      state.persistenceQueue.deletedGlyphIds =
        state.persistenceQueue.deletedGlyphIds.filter((id) => {
          if (
            savedDeleted.has(id) &&
            canClearRevision(state.persistenceQueue.deletedGlyphRevisions[id])
          ) {
            delete state.persistenceQueue.deletedGlyphRevisions[id]
            return false
          }
          return true
        })
      if (
        state.persistenceQueue.projectQueued &&
        canClearRevision(state.persistenceQueue.projectRevision ?? undefined)
      ) {
        state.persistenceQueue.projectQueued = false
        state.persistenceQueue.projectRevision = null
      }
      if (
        state.persistenceQueue.uiStateQueued &&
        canClearRevision(state.persistenceQueue.uiStateRevision ?? undefined)
      ) {
        state.persistenceQueue.uiStateQueued = false
        state.persistenceQueue.uiStateRevision = null
      }
      syncDirtyListsFromQueue(state)
      if (!state.isDirty && state.persistenceQueue.status === 'saving') {
        state.persistenceQueue.status = 'saved'
      }
    }),

  setPersistenceStatus: (
    status: GlobalState['persistenceStatus'],
    error: string | null = null
  ) =>
    set((state) => {
      if (status === 'saved' && hasQueuedPersistence(state)) {
        state.persistenceStatus = 'queued'
        state.persistenceError = null
        state.persistenceQueue.status = 'queued'
        state.persistenceQueue.lastError = null
        return
      }
      state.persistenceStatus = status
      state.persistenceError = error
      state.persistenceQueue.status = status
      state.persistenceQueue.lastError = error
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
            state.editLocation = state.activeMasterId
              ? { ...nextSources[state.activeMasterId].location }
              : {}
          }
        }
      }

      markProjectDirty(state)
    }),
})
