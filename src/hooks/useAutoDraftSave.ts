import { useEffect, useRef } from 'react'
import { saveDraftSnapshot } from 'src/lib/draftSave'
import { useStore } from 'src/store'

const AUTO_DRAFT_SAVE_DELAY_MS = 60_000

export function useAutoDraftSave() {
  const fontData = useStore((state) => state.fontData)
  const projectId = useStore((state) => state.projectId)
  const projectTitle = useStore((state) => state.projectTitle)
  const dirtyGlyphIds = useStore((state) => state.dirtyGlyphIds)
  const deletedGlyphIds = useStore((state) => state.deletedGlyphIds)
  const selectedLayerId = useStore((state) => state.selectedLayerId)
  const isDirty = useStore((state) => state.isDirty)
  const markDraftSaved = useStore((state) => state.markDraftSaved)
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
      void saveDraftSnapshot({
        projectId,
        projectTitle,
        fontData,
        dirtyGlyphIds,
        deletedGlyphIds,
        selectedLayerId,
      })
        .then(() => {
          markDraftSaved()
        })
        .catch((error) => {
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
    isDirty,
    markDraftSaved,
    projectId,
    projectTitle,
    selectedLayerId,
  ])
}
