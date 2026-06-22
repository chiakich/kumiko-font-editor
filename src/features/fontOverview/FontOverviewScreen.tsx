import { Grid, GridItem } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ListRange } from 'react-virtuoso'
import { useStore, type GlyphData } from 'src/store'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import {
  buildGlyphPreviewData,
  buildGlyphPreviewFontRect,
} from 'src/lib/glyph/glyphOverview'
import { setEditorViewTransitionLandingGlyphId } from 'src/features/editor/editorViewTransitionLandingStore'
import { setPendingEditorViewportRect } from 'src/features/editor/pendingEditorViewport'
import { preloadEditorLayout } from 'src/features/editor/preloadEditorLayout'
import { loadProjectGlyphGeometryClosure } from 'src/lib/project/projectRepository'
import { AddGlyphModal } from 'src/features/fontOverview/components/AddGlyphModal'
import { OverviewContent } from 'src/features/fontOverview/components/OverviewContent'
import { OverviewRightPanel } from 'src/features/fontOverview/components/OverviewRightPanel'
import { OverviewSidebar } from 'src/features/fontOverview/components/OverviewSidebar'
import { useAddGlyphsFlow } from 'src/features/fontOverview/hooks/useAddGlyphsFlow'
import { useCloseProjectWithDraftSave } from 'src/features/fontOverview/hooks/useCloseProjectWithDraftSave'
import { useHistoryShortcuts } from 'src/features/fontOverview/hooks/useHistoryShortcuts'
import { useOverviewGridPersistence } from 'src/features/fontOverview/hooks/useOverviewGridPersistence'
import { useOverviewGlyphPreviews } from 'src/features/fontOverview/hooks/useOverviewGlyphPreviews'
import { useOverviewSections } from 'src/features/fontOverview/hooks/useOverviewSections'
import { useOverviewSelection } from 'src/features/fontOverview/hooks/useOverviewSelection'
import {
  collectOverviewGeometryGlyphIds,
  OVERVIEW_MAX_RESIDENT_GLYPH_GEOMETRY,
} from 'src/features/fontOverview/utils/overviewGeometryWindow'
import {
  buildOverviewGridZoomLayout,
  clampOverviewGridSizePx,
  DEFAULT_OVERVIEW_GRID_SIZE_PX,
  formatOverviewGridSizeInput,
  MAX_OVERVIEW_GRID_SIZE_PX,
  MIN_OVERVIEW_GRID_SIZE_PX,
  OVERVIEW_GRID_SIZE_STEP_BY_UNIT,
  overviewGridSizeUnitToPx,
  overviewGridSizePxToUnit,
  parseOverviewGridSizeInput,
  type OverviewGridSizeUnit,
} from 'src/features/fontOverview/utils/overviewGridZoom'

const OVERVIEW_GRID_SIZE_INPUT_DEBOUNCE_MS = 250

export function FontOverviewScreen() {
  useHistoryShortcuts()

  const [showOnlyEmptyGlyphs, setShowOnlyEmptyGlyphs] = useState(false)
  const [overviewGridSizePx, setOverviewGridSizePx] = useState(
    DEFAULT_OVERVIEW_GRID_SIZE_PX
  )
  const [overviewGridSizeUnit, setOverviewGridSizeUnit] =
    useState<OverviewGridSizeUnit>('px')
  const [overviewGridSizeInput, setOverviewGridSizeInput] = useState(() =>
    formatOverviewGridSizeInput(DEFAULT_OVERVIEW_GRID_SIZE_PX, 'px')
  )
  const [transitioningGlyphId, setTransitioningGlyphId] = useState<
    string | null
  >(null)
  const [overviewPreviewWindow, setOverviewPreviewWindow] = useState<{
    glyphIds: string[]
    sectionId: string
  } | null>(null)
  const currentSearchQuery = useStore((state) => state.currentSearchQuery)
  const setSearchQuery = useStore((state) => state.setSearchQuery)
  const filteredGlyphList = useStore((state) => state.filteredGlyphList)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const setEditorTextState = useStore((state) => state.setEditorTextState)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const projectTitle = useStore((state) => state.projectTitle)
  const fontData = useStore((state) => state.fontData)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const selectedSectionId = useStore((state) => state.overviewSectionId)
  const setOverviewSectionId = useStore((state) => state.setOverviewSectionId)
  const hydrateGlyphGeometry = useStore((state) => state.hydrateGlyphGeometry)
  const activeMasterId = useStore((state) => state.activeMasterId)
  const loadingGlyphGeometryPromisesRef = useRef(
    new Map<string, Promise<GlyphData[]>>()
  )
  const overviewGeometryRequestIdRef = useRef(0)

  const { closeProject, isClosingProject } = useCloseProjectWithDraftSave()
  const {
    activeSection,
    overviewGlyphs,
    sections,
    treeNodes,
    visibleSections,
  } = useOverviewSections({
    filteredGlyphList,
    glyphEditTimes,
    selectedSectionId,
    showOnlyEmptyGlyphs,
    onSelectedSectionChange: setOverviewSectionId,
  })
  const {
    gridRef,
    handleGridRangeChange,
    handleGridStateChange,
    overviewGridState,
    overviewTopGlyphId,
    resetGridState,
    savePendingGridState,
  } = useOverviewGridPersistence({ activeGlyphs: activeSection.glyphs })
  const {
    handleDeleteSelectedGlyphs,
    handleGlyphSelect,
    overviewSelectedGlyphIds,
    selectAddedGlyphs,
    selectedGlyphIdList,
    selectedGlyphIdSet,
    selectGlyphsWithAnchor,
  } = useOverviewSelection({
    activeGlyphs: activeSection.glyphs,
    selectedGlyphId,
  })

  const selectedGlyph =
    overviewGlyphs.find((glyph) => glyph.id === selectedGlyphId) ?? null
  const overviewGridZoom = useMemo(
    () => buildOverviewGridZoomLayout(overviewGridSizePx),
    [overviewGridSizePx]
  )
  const canZoomIn = overviewGridSizePx < MAX_OVERVIEW_GRID_SIZE_PX
  const canZoomOut = overviewGridSizePx > MIN_OVERVIEW_GRID_SIZE_PX
  const glyphMap = useMemo(() => fontData?.glyphs ?? {}, [fontData?.glyphs])
  const overviewPreviewGlyphIds = useMemo(() => {
    if (overviewPreviewWindow?.sectionId === activeSection.id) {
      return overviewPreviewWindow.glyphIds
    }
    return collectOverviewGeometryGlyphIds(activeSection.glyphs, {
      startIndex: 0,
      endIndex: 0,
    })
  }, [activeSection.glyphs, activeSection.id, overviewPreviewWindow])
  const overviewGlyphPreviews = useOverviewGlyphPreviews({
    activeMasterId,
    glyphEditTimes,
    glyphIds: overviewPreviewGlyphIds,
    glyphMap,
    unitsPerEm: fontData?.unitsPerEm,
  })
  const {
    addGlyphNames,
    addGlyphsFromInput,
    closeAddGlyphModal,
    glyphInputValue,
    isAddingGlyphs,
    openAddGlyphModal,
    setGlyphInputValue,
  } = useAddGlyphsFlow({
    fontData,
    glyphMap,
    onGlyphsAdded: selectAddedGlyphs,
  })

  const getEditorTextForGlyphIds = useCallback(
    (glyphIds: string[]) =>
      glyphIds
        .map((glyphId) => {
          return getGlyphUnicodeChar(glyphMap[glyphId]) ?? ''
        })
        .join(''),
    [glyphMap]
  )

  const ensureGlyphGeometryLoaded = useCallback(
    async (
      glyphIds: string[],
      options: {
        maxLoadedGlyphs?: number
        shouldHydrate?: () => boolean
      } = {}
    ) => {
      const currentState = useStore.getState()
      const currentProjectId = currentState.projectId
      const currentGlyphMap = currentState.fontData?.glyphs
      if (!currentProjectId || !currentGlyphMap) {
        return
      }
      const pendingLoads: Promise<GlyphData[]>[] = []
      const missingGlyphIds = [...new Set(glyphIds)].filter((glyphId) => {
        const glyph = currentGlyphMap[glyphId]
        const pendingLoad = loadingGlyphGeometryPromisesRef.current.get(glyphId)
        if (pendingLoad) {
          pendingLoads.push(pendingLoad)
          return false
        }
        return glyph && !isGlyphGeometryLoaded(glyph)
      })
      const loadPromises = [...new Set(pendingLoads)]

      if (missingGlyphIds.length > 0) {
        const loadPromise = (async () => {
          const latestState = useStore.getState()
          const latestGlyphMap =
            latestState.projectId === currentProjectId
              ? (latestState.fontData?.glyphs ?? {})
              : {}
          const loadedGlyphIds = Object.values(latestGlyphMap)
            .filter(isGlyphGeometryLoaded)
            .map((glyph) => glyph.id)
          return loadProjectGlyphGeometryClosure(
            currentProjectId,
            missingGlyphIds,
            { loadedGlyphIds }
          )
        })().finally(() => {
          for (const glyphId of missingGlyphIds) {
            loadingGlyphGeometryPromisesRef.current.delete(glyphId)
          }
        })
        for (const glyphId of missingGlyphIds) {
          loadingGlyphGeometryPromisesRef.current.set(glyphId, loadPromise)
        }
        loadPromises.push(loadPromise)
      }

      if (loadPromises.length === 0) {
        return
      }

      const loadedGlyphs = (await Promise.all(loadPromises)).flat()
      if (useStore.getState().projectId !== currentProjectId) {
        return
      }
      if (options.shouldHydrate && !options.shouldHydrate()) {
        return
      }
      hydrateGlyphGeometry(
        loadedGlyphs,
        options.maxLoadedGlyphs
          ? { maxLoadedGlyphs: options.maxLoadedGlyphs }
          : undefined
      )
    },
    [hydrateGlyphGeometry]
  )

  const handleRangeChange = useCallback(
    (range: ListRange) => {
      handleGridRangeChange(range)
      overviewGeometryRequestIdRef.current += 1
      const requestId = overviewGeometryRequestIdRef.current
      const glyphIds = collectOverviewGeometryGlyphIds(
        activeSection.glyphs,
        range
      )
      setOverviewPreviewWindow((current) => {
        if (
          current?.sectionId === activeSection.id &&
          current.glyphIds.length === glyphIds.length &&
          current.glyphIds.every(
            (glyphId, index) => glyphId === glyphIds[index]
          )
        ) {
          return current
        }
        return { glyphIds, sectionId: activeSection.id }
      })
      void ensureGlyphGeometryLoaded(glyphIds, {
        maxLoadedGlyphs: OVERVIEW_MAX_RESIDENT_GLYPH_GEOMETRY,
        shouldHydrate: () => overviewGeometryRequestIdRef.current === requestId,
      })
    },
    [
      activeSection.glyphs,
      activeSection.id,
      ensureGlyphGeometryLoaded,
      handleGridRangeChange,
    ]
  )

  const handleSectionSelect = (sectionId: string) => {
    if (sectionId === selectedSectionId) {
      return
    }

    resetGridState()
    setOverviewSectionId(sectionId)
    if (sectionId === 'all') {
      return
    }

    const targetSection = sections.find((section) => section.id === sectionId)
    if (!targetSection) {
      return
    }

    if (
      !selectedGlyph ||
      !targetSection.glyphs.some((glyph) => glyph.id === selectedGlyph.id)
    ) {
      const primaryGlyphId = targetSection.glyphs[0]?.id ?? null
      selectGlyphsWithAnchor(
        primaryGlyphId ? [primaryGlyphId] : [],
        primaryGlyphId
      )
    }
  }

  const applyOverviewGridSizePx = useCallback(
    (nextSizePx: number) => {
      const clampedSizePx = clampOverviewGridSizePx(nextSizePx)
      if (clampedSizePx !== overviewGridSizePx) {
        resetGridState()
        setOverviewGridSizePx(clampedSizePx)
      }
      return clampedSizePx
    },
    [overviewGridSizePx, resetGridState]
  )

  const handleOverviewGridSizeInputChange = useCallback((value: string) => {
    setOverviewGridSizeInput(value)
  }, [])

  useEffect(() => {
    const parsedInput = parseOverviewGridSizeInput(overviewGridSizeInput)
    if (parsedInput === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      applyOverviewGridSizePx(
        overviewGridSizeUnitToPx(parsedInput.value, parsedInput.unit)
      )
      setOverviewGridSizeUnit(parsedInput.unit)
    }, OVERVIEW_GRID_SIZE_INPUT_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [applyOverviewGridSizePx, overviewGridSizeInput])

  const handleOverviewGridSizeInputBlur = useCallback(() => {
    const parsedInput = parseOverviewGridSizeInput(overviewGridSizeInput)
    if (parsedInput === null) {
      setOverviewGridSizeInput(
        formatOverviewGridSizeInput(overviewGridSizePx, overviewGridSizeUnit)
      )
      return
    }

    const clampedSizePx = applyOverviewGridSizePx(
      overviewGridSizeUnitToPx(parsedInput.value, parsedInput.unit)
    )
    setOverviewGridSizeUnit(parsedInput.unit)
    setOverviewGridSizeInput(
      formatOverviewGridSizeInput(clampedSizePx, parsedInput.unit)
    )
  }, [
    applyOverviewGridSizePx,
    overviewGridSizeInput,
    overviewGridSizePx,
    overviewGridSizeUnit,
  ])

  const stepOverviewGridSize = useCallback(
    (direction: 1 | -1) => {
      const parsedInput = parseOverviewGridSizeInput(overviewGridSizeInput)
      const stepUnit = parsedInput?.unit ?? overviewGridSizeUnit
      const currentUnitValue =
        parsedInput?.value ??
        overviewGridSizePxToUnit(overviewGridSizePx, stepUnit)
      const nextUnitValue =
        currentUnitValue + OVERVIEW_GRID_SIZE_STEP_BY_UNIT[stepUnit] * direction
      const clampedSizePx = applyOverviewGridSizePx(
        overviewGridSizeUnitToPx(nextUnitValue, stepUnit)
      )
      setOverviewGridSizeUnit(stepUnit)
      setOverviewGridSizeInput(
        formatOverviewGridSizeInput(clampedSizePx, stepUnit)
      )
    },
    [
      applyOverviewGridSizePx,
      overviewGridSizeInput,
      overviewGridSizePx,
      overviewGridSizeUnit,
    ]
  )

  const handleOverviewZoomIn = useCallback(() => {
    stepOverviewGridSize(1)
  }, [stepOverviewGridSize])

  const handleOverviewZoomOut = useCallback(() => {
    stepOverviewGridSize(-1)
  }, [stepOverviewGridSize])

  const handleEnterEditor = useCallback(
    async (glyphId: string) => {
      savePendingGridState()
      const selectedGlyphIds = new Set(overviewSelectedGlyphIds)
      if (selectedGlyphId) {
        selectedGlyphIds.add(selectedGlyphId)
      }

      const selectedEditorGlyphIds = activeSection.glyphs
        .map((glyph) => glyph.id)
        .filter((selectedGlyphId) => selectedGlyphIds.has(selectedGlyphId))
      const nextEditorGlyphIds = selectedGlyphIds.has(glyphId)
        ? selectedEditorGlyphIds
        : [glyphId]
      const activeGlyphIndex = Math.max(0, nextEditorGlyphIds.indexOf(glyphId))

      await ensureGlyphGeometryLoaded(nextEditorGlyphIds)
      setEditorTextState(
        getEditorTextForGlyphIds(nextEditorGlyphIds),
        nextEditorGlyphIds,
        activeGlyphIndex + 1,
        activeGlyphIndex
      )

      // Store the preview's font-space Rect so the canvas uses the same
      // viewport region on first render, aligning the glyph with the SVG preview.
      const targetGlyph = useStore.getState().fontData?.glyphs[glyphId]
      const unitsPerEm = useStore.getState().fontData?.unitsPerEm ?? 1000
      if (targetGlyph) {
        const preview = buildGlyphPreviewData(
          targetGlyph,
          glyphMap,
          unitsPerEm,
          activeMasterId
        )
        setPendingEditorViewportRect(buildGlyphPreviewFontRect(preview))
      }

      if (!('startViewTransition' in document)) {
        setWorkspaceView('editor')
        return
      }

      await preloadEditorLayout()

      flushSync(() => {
        setEditorViewTransitionLandingGlyphId(glyphId)
        setTransitioningGlyphId(glyphId)
      })
      const transition = (
        document as Document & { startViewTransition: (cb: () => void) => void }
      ).startViewTransition(() => {
        flushSync(() => {
          setTransitioningGlyphId(null)
          setWorkspaceView('editor')
        })
      })
      void transition.ready.finally(() => {
        setEditorViewTransitionLandingGlyphId(null)
      })
    },
    [
      activeSection.glyphs,
      activeMasterId,
      getEditorTextForGlyphIds,
      glyphMap,
      overviewSelectedGlyphIds,
      savePendingGridState,
      selectedGlyphId,
      ensureGlyphGeometryLoaded,
      setEditorTextState,
      setWorkspaceView,
    ]
  )

  return (
    <>
      <Grid
        templateColumns="280px minmax(0, 1fr) 320px"
        templateAreas={`"left center right"`}
        h="100vh"
        w="100vw"
        overflow="hidden"
        bg="field.paper"
      >
        <GridItem area="left" minW={0} minH={0}>
          <OverviewSidebar
            currentSearchQuery={currentSearchQuery}
            overviewGlyphCount={overviewGlyphs.length}
            projectTitle={projectTitle}
            selectedSectionId={selectedSectionId}
            showOnlyEmptyGlyphs={showOnlyEmptyGlyphs}
            isClosingProject={isClosingProject}
            treeNodes={treeNodes}
            onCloseProject={closeProject}
            onSearchQueryChange={setSearchQuery}
            onSectionSelect={handleSectionSelect}
            onShowOnlyEmptyGlyphsChange={setShowOnlyEmptyGlyphs}
          />
        </GridItem>

        <GridItem area="center" minW={0} minH={0}>
          <OverviewContent
            activeSection={activeSection}
            gridRef={gridRef}
            glyphMap={glyphMap}
            glyphPreviews={overviewGlyphPreviews}
            restoreSnapshot={overviewGridState}
            selectedGlyphIds={selectedGlyphIdSet}
            topGlyphId={overviewTopGlyphId}
            transitioningGlyphId={transitioningGlyphId}
            visibleSections={visibleSections}
            zoomLayout={overviewGridZoom}
            zoomSizeInputValue={overviewGridSizeInput}
            canZoomIn={canZoomIn}
            canZoomOut={canZoomOut}
            onEnterEditor={handleEnterEditor}
            onOpenAddGlyphModal={openAddGlyphModal}
            onGridStateChange={handleGridStateChange}
            onZoomSizeInputBlur={handleOverviewGridSizeInputBlur}
            onZoomSizeInputChange={handleOverviewGridSizeInputChange}
            onZoomIn={handleOverviewZoomIn}
            onZoomOut={handleOverviewZoomOut}
            onRangeChange={handleRangeChange}
            onSelectGlyph={handleGlyphSelect}
          />
        </GridItem>

        <GridItem area="right" minW={0} minH={0}>
          <OverviewRightPanel
            selectedGlyphIds={selectedGlyphIdList}
            onDeleteSelectedGlyphs={handleDeleteSelectedGlyphs}
            onEnterEditor={handleEnterEditor}
          />
        </GridItem>
      </Grid>

      <AddGlyphModal
        glyphMap={glyphMap}
        inputValue={glyphInputValue}
        isOpen={isAddingGlyphs}
        onClose={closeAddGlyphModal}
        onInputChange={setGlyphInputValue}
        onSubmitGlyphNames={addGlyphNames}
        onSubmitManualInput={() => void addGlyphsFromInput()}
      />
    </>
  )
}
