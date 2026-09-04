import { useCallback, useEffect, useRef } from 'react'
import type {
  GridStateSnapshot,
  ListRange,
  VirtuosoGridHandle,
} from 'react-virtuoso'
import { useStore, type GlyphData } from '@/store'

interface UseOverviewGridPersistenceOptions {
  activeGlyphs: GlyphData[]
}

export function useOverviewGridPersistence({
  activeGlyphs,
}: UseOverviewGridPersistenceOptions) {
  const overviewGridState = useStore(
    (state) => state.overviewGridState
  ) as GridStateSnapshot | null
  const setOverviewGridState = useStore((state) => state.setOverviewGridState)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const setOverviewTopGlyphId = useStore((state) => state.setOverviewTopGlyphId)
  const gridRef = useRef<VirtuosoGridHandle | null>(null)
  const pendingOverviewGridStateRef = useRef<GridStateSnapshot | null>(
    overviewGridState
  )
  const storedOverviewGridStateRef = useRef<GridStateSnapshot | null>(
    overviewGridState
  )

  useEffect(() => {
    storedOverviewGridStateRef.current = overviewGridState
  }, [overviewGridState])

  useEffect(() => {
    return () => {
      const pendingScrollTop =
        pendingOverviewGridStateRef.current?.scrollTop ?? null
      const storedScrollTop =
        storedOverviewGridStateRef.current?.scrollTop ?? null

      if (
        pendingScrollTop === 0 &&
        storedScrollTop !== null &&
        storedScrollTop > 0
      ) {
        return
      }

      setOverviewGridState(pendingOverviewGridStateRef.current)
    }
  }, [setOverviewGridState])

  const handleGridStateChange = useCallback((state: GridStateSnapshot) => {
    pendingOverviewGridStateRef.current = state
  }, [])

  const handleGridRangeChange = useCallback(
    (range: ListRange) => {
      setOverviewTopGlyphId(activeGlyphs[range.startIndex]?.id ?? null)
    },
    [activeGlyphs, setOverviewTopGlyphId]
  )

  const resetGridState = useCallback(() => {
    pendingOverviewGridStateRef.current = null
    setOverviewGridState(null)
  }, [setOverviewGridState])

  const savePendingGridState = useCallback(() => {
    setOverviewGridState(pendingOverviewGridStateRef.current)
  }, [setOverviewGridState])

  return {
    gridRef,
    handleGridRangeChange,
    handleGridStateChange,
    overviewGridState,
    overviewTopGlyphId,
    resetGridState,
    savePendingGridState,
  }
}
