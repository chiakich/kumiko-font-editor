import { Grid, GridItem } from '@chakra-ui/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ListRange } from 'react-virtuoso'
import { useStore } from 'src/store'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import { loadProjectGlyphGeometryClosure } from 'src/lib/project/projectRepository'
import { AddGlyphModal } from 'src/features/fontOverview/components/AddGlyphModal'
import { OverviewContent } from 'src/features/fontOverview/components/OverviewContent'
import { OverviewRightPanel } from 'src/features/fontOverview/components/OverviewRightPanel'
import { OverviewSidebar } from 'src/features/fontOverview/components/OverviewSidebar'
import { useAddGlyphsFlow } from 'src/features/fontOverview/hooks/useAddGlyphsFlow'
import { useCloseProjectWithDraftSave } from 'src/features/fontOverview/hooks/useCloseProjectWithDraftSave'
import { useHistoryShortcuts } from 'src/features/fontOverview/hooks/useHistoryShortcuts'
import { useOverviewGridPersistence } from 'src/features/fontOverview/hooks/useOverviewGridPersistence'
import { useOverviewSections } from 'src/features/fontOverview/hooks/useOverviewSections'
import { useOverviewSelection } from 'src/features/fontOverview/hooks/useOverviewSelection'

export function FontOverviewScreen() {
  useHistoryShortcuts()

  const [showOnlyEmptyGlyphs, setShowOnlyEmptyGlyphs] = useState(false)
  const currentSearchQuery = useStore((state) => state.currentSearchQuery)
  const setSearchQuery = useStore((state) => state.setSearchQuery)
  const filteredGlyphList = useStore((state) => state.filteredGlyphList)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const setEditorTextState = useStore((state) => state.setEditorTextState)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const projectTitle = useStore((state) => state.projectTitle)
  const projectId = useStore((state) => state.projectId)
  const fontData = useStore((state) => state.fontData)
  const glyphEditTimes = useStore((state) => state.glyphEditTimes)
  const selectedSectionId = useStore((state) => state.overviewSectionId)
  const setOverviewSectionId = useStore((state) => state.setOverviewSectionId)
  const hydrateGlyphGeometry = useStore((state) => state.hydrateGlyphGeometry)
  const loadingGlyphGeometryPromisesRef = useRef(
    new Map<string, Promise<void>>()
  )

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
  const glyphMap = useMemo(() => fontData?.glyphs ?? {}, [fontData?.glyphs])
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
    async (glyphIds: string[]) => {
      if (!projectId) {
        return
      }
      const pendingLoads: Promise<void>[] = []
      const missingGlyphIds = [...new Set(glyphIds)].filter((glyphId) => {
        const glyph = glyphMap[glyphId]
        const pendingLoad = loadingGlyphGeometryPromisesRef.current.get(glyphId)
        if (pendingLoad) {
          pendingLoads.push(pendingLoad)
          return false
        }
        return glyph && !isGlyphGeometryLoaded(glyph)
      })

      if (missingGlyphIds.length === 0) {
        await Promise.all(pendingLoads)
        return
      }

      const loadPromise = (async () => {
        const loadedGlyphIds = Object.values(glyphMap)
          .filter(isGlyphGeometryLoaded)
          .map((glyph) => glyph.id)
        const glyphs = await loadProjectGlyphGeometryClosure(
          projectId,
          missingGlyphIds,
          { loadedGlyphIds }
        )
        hydrateGlyphGeometry(glyphs)
      })().finally(() => {
        for (const glyphId of missingGlyphIds) {
          loadingGlyphGeometryPromisesRef.current.delete(glyphId)
        }
      })
      for (const glyphId of missingGlyphIds) {
        loadingGlyphGeometryPromisesRef.current.set(glyphId, loadPromise)
      }
      await Promise.all([...pendingLoads, loadPromise])
    },
    [glyphMap, hydrateGlyphGeometry, projectId]
  )

  const handleRangeChange = useCallback(
    (range: ListRange) => {
      handleGridRangeChange(range)
      const startIndex = Math.max(0, range.startIndex - 12)
      const endIndex = Math.min(
        activeSection.glyphs.length - 1,
        range.endIndex + 12
      )
      const glyphIds = activeSection.glyphs
        .slice(startIndex, endIndex + 1)
        .map((glyph) => glyph.id)
      void ensureGlyphGeometryLoaded(glyphIds)
    },
    [activeSection.glyphs, ensureGlyphGeometryLoaded, handleGridRangeChange]
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
      setWorkspaceView('editor')
    },
    [
      activeSection.glyphs,
      getEditorTextForGlyphIds,
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
            glyphMap={glyphMap}
            gridRef={gridRef}
            restoreSnapshot={overviewGridState}
            selectedGlyphIds={selectedGlyphIdSet}
            topGlyphId={overviewTopGlyphId}
            visibleSections={visibleSections}
            onEnterEditor={handleEnterEditor}
            onOpenAddGlyphModal={openAddGlyphModal}
            onGridStateChange={handleGridStateChange}
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
