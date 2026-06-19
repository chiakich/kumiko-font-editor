import { useEffect, useRef } from 'react'
import { saveDraftSnapshot } from 'src/lib/project/draftSave'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { useStore } from 'src/store'

const AUTO_DRAFT_SAVE_DELAY_MS = 60_000

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Auto draft save failed.'

export function useAutoDraftSave() {
  const fontData = useStore((state) => state.fontData)
  const projectId = useStore((state) => state.projectId)
  const projectTitle = useStore((state) => state.projectTitle)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const persistenceQueue = useStore((state) => state.persistenceQueue)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const overviewSectionId = useStore((state) => state.overviewSectionId)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const overviewGridState = useStore((state) => state.overviewGridState)
  const isDirty = useStore((state) => state.isDirty)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const autosaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!fontData || !projectId || !projectTitle || !isDirty) {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
      return
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      setPersistenceStatus('saving')
      void saveDraftSnapshot({
        projectId,
        projectTitle,
        fontData,
        projectQueued: persistenceQueue.projectQueued,
        projectUiState: createProjectUiStateSnapshot({
          selectedGlyphId,
          selectedLayerId,
          activeMasterId,
          overviewSectionId,
          overviewTopGlyphId,
          overviewGridState,
        }),
        dirtyGlyphIds,
        deletedGlyphIds,
        glyphEditTimes,
        selectedLayerId,
      })
        .then(() => {
          markDraftSaved(
            dirtyGlyphIds,
            deletedGlyphIds,
            persistenceQueue.revision
          )
          setPersistenceStatus('saved')
        })
        .catch((error) => {
          setPersistenceStatus('error', getErrorMessage(error))
          console.warn('Auto draft save failed.', error)
        })
    }, AUTO_DRAFT_SAVE_DELAY_MS)

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [
    deletedGlyphIds,
    dirtyGlyphIds,
    fontData,
    glyphEditTimes,
    isDirty,
    markDraftSaved,
    activeMasterId,
    overviewGridState,
    overviewSectionId,
    overviewTopGlyphId,
    persistenceQueue.projectQueued,
    persistenceQueue.revision,
    projectId,
    projectTitle,
    selectedGlyphId,
    selectedLayerId,
    setPersistenceStatus,
  ])
}
