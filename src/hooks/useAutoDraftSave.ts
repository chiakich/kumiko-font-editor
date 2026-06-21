import { useEffect, useRef } from 'react'
import { useFlushCurrentDraft } from 'src/features/common/projectPersistence/useFlushCurrentDraft'
import { flushPendingDraft } from 'src/lib/project/flushPendingDraft'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { useStore } from 'src/store'

export const AUTO_DRAFT_SAVE_DELAY_MS = 10_000

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
  const persistenceStatus = useStore((state) => state.persistenceStatus)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
  const setPersistenceStatus = useStore((state) => state.setPersistenceStatus)
  const flushCurrentDraft = useFlushCurrentDraft()
  const autosaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (
      !fontData ||
      !projectId ||
      !projectTitle ||
      !isDirty ||
      persistenceStatus === 'error'
    ) {
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
      void flushPendingDraft({
        projectId,
        projectTitle,
        fontData,
        projectQueued: persistenceQueue.projectQueued,
        uiStateQueued: persistenceQueue.uiStateQueued,
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
        persistenceRevision: persistenceQueue.revision,
        glyphEditTimes,
        selectedLayerId,
        setPersistenceStatus,
        markDraftSaved,
      }).catch((error) => {
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
    persistenceStatus,
    persistenceQueue.projectQueued,
    persistenceQueue.revision,
    persistenceQueue.uiStateQueued,
    projectId,
    projectTitle,
    selectedGlyphId,
    selectedLayerId,
    setPersistenceStatus,
  ])

  useEffect(() => {
    if (!isDirty || persistenceStatus === 'saved') {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const handlePageHide = () => {
      void flushCurrentDraft().catch((error) => {
        console.warn('Pagehide draft save failed.', error)
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [flushCurrentDraft, isDirty, persistenceStatus])
}
