import { useEffect } from 'react'
import { loadReferenceFontRecord } from 'src/lib/referenceFont/referenceFontPersistence'
import {
  clearReferenceFont,
  loadReferenceFontFromBytes,
} from 'src/lib/referenceFont/referenceFontStore'

interface ReferenceFontRestorationOptions {
  projectId: string | null
  clearReferenceFontResidual: () => void
  setReferenceFontChar: (char: string | null) => void
  setReferenceFontName: (name: string | null) => void
  setReferenceFontVisible: (visible: boolean) => void
}

export function useReferenceFontRestoration({
  projectId,
  clearReferenceFontResidual,
  setReferenceFontChar,
  setReferenceFontName,
  setReferenceFontVisible,
}: ReferenceFontRestorationOptions) {
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      const record = projectId
        ? await loadReferenceFontRecord(projectId)
        : undefined
      if (cancelled) {
        return
      }
      if (record) {
        try {
          const name = loadReferenceFontFromBytes(
            record.fontBytes,
            record.fontName
          )
          clearReferenceFontResidual()
          setReferenceFontName(name)
          setReferenceFontVisible(true)
          setReferenceFontChar(null)
          return
        } catch {
          // Fall through to the cleared state below.
        }
      }
      clearReferenceFont()
      clearReferenceFontResidual()
      setReferenceFontName(null)
      setReferenceFontVisible(false)
      setReferenceFontChar(null)
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    clearReferenceFontResidual,
    setReferenceFontChar,
    setReferenceFontName,
    setReferenceFontVisible,
  ])
}
