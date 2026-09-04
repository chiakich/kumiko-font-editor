import { useEffect, useRef } from 'react'
import { loadReferenceFontRecord } from '@/lib/referenceFont/referenceFontPersistence'
import {
  clearReferenceFont,
  loadReferenceFontFromBytes,
} from '@/lib/referenceFont/referenceFontStore'

interface ReferenceFontRestorationOptions {
  projectId: string | null
  referenceFontLocale: string | null
  clearReferenceFontResidual: () => void
  setReferenceFontChar: (char: string | null) => void
  setReferenceFontName: (name: string | null) => void
  setReferenceFontVisible: (visible: boolean) => void
}

export function useReferenceFontRestoration({
  projectId,
  referenceFontLocale,
  clearReferenceFontResidual,
  setReferenceFontChar,
  setReferenceFontName,
  setReferenceFontVisible,
}: ReferenceFontRestorationOptions) {
  const restoredProjectIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const projectChanged = restoredProjectIdRef.current !== projectId
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
            record.fontName,
            referenceFontLocale
          )
          setReferenceFontName(name)
          if (projectChanged) {
            clearReferenceFontResidual()
            setReferenceFontVisible(true)
            setReferenceFontChar(null)
          }
          restoredProjectIdRef.current = projectId
          return
        } catch {
          // Fall through to the cleared state below.
        }
      }
      if (projectChanged) {
        clearReferenceFont()
        clearReferenceFontResidual()
        setReferenceFontName(null)
        setReferenceFontVisible(false)
        setReferenceFontChar(null)
        restoredProjectIdRef.current = projectId
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [
    projectId,
    referenceFontLocale,
    clearReferenceFontResidual,
    setReferenceFontChar,
    setReferenceFontName,
    setReferenceFontVisible,
  ])
}
