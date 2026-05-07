import { Grid, GridItem, useToast } from '@chakra-ui/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import type {
  GridStateSnapshot,
  ListRange,
  VirtuosoGridHandle,
} from 'react-virtuoso'
import {
  getGlyphOverviewSections,
  type OverviewGroupBy,
} from 'src/lib/glyphOverview'
import { useStore } from 'src/store'
import { OverviewContent } from 'src/features/fontOverview/OverviewContent'
import { OverviewRightPanel } from 'src/features/fontOverview/OverviewRightPanel'
import { OverviewSidebar } from 'src/features/fontOverview/OverviewSidebar'
import { parseGlyphAdditionInput } from 'src/features/fontOverview/glyphInput'

export function FontOverviewScreen() {
  const toast = useToast()
  const [isAddingGlyphs, setIsAddingGlyphs] = useState(false)
  const [glyphInputValue, setGlyphInputValue] = useState('')
  const [showOnlyEmptyGlyphs, setShowOnlyEmptyGlyphs] = useState(false)
  const currentSearchQuery = useStore((state) => state.currentSearchQuery)
  const setSearchQuery = useStore((state) => state.setSearchQuery)
  const filteredGlyphList = useStore((state) => state.filteredGlyphList)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const setSelectedGlyphId = useStore((state) => state.setSelectedGlyphId)
  const addGlyphs = useStore((state) => state.addGlyphs)
  const setEditorTextState = useStore((state) => state.setEditorTextState)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const closeProjectState = useStore((state) => state.closeProjectState)
  const projectTitle = useStore((state) => state.projectTitle)
  const fontData = useStore((state) => state.fontData)
  const groupBy = useStore((state) => state.overviewGroupBy) as OverviewGroupBy
  const setOverviewGrouping = useStore((state) => state.setOverviewGrouping)
  const selectedSectionId = useStore((state) => state.overviewSectionId)
  const setOverviewSectionId = useStore((state) => state.setOverviewSectionId)
  const overviewGridState = useStore(
    (state) => state.overviewGridState
  ) as GridStateSnapshot | null
  const setOverviewGridState = useStore((state) => state.setOverviewGridState)
  const overviewTopGlyphId = useStore((state) => state.overviewTopGlyphId)
  const setOverviewTopGlyphId = useStore((state) => state.setOverviewTopGlyphId)
  const gridRef = useRef<VirtuosoGridHandle | null>(null)
  const selectionAnchorGlyphIdRef = useRef<string | null>(selectedGlyphId)
  const [overviewSelectedGlyphIds, setOverviewSelectedGlyphIds] = useState<
    string[]
  >(() => (selectedGlyphId ? [selectedGlyphId] : []))
  const pendingOverviewGridStateRef = useRef<GridStateSnapshot | null>(
    overviewGridState
  )

  const overviewGlyphs = useMemo(
    () =>
      showOnlyEmptyGlyphs
        ? filteredGlyphList.filter(
            (glyph) =>
              glyph.paths.length === 0 && glyph.componentRefs.length === 0
          )
        : filteredGlyphList,
    [filteredGlyphList, showOnlyEmptyGlyphs]
  )

  const sections = useMemo(
    () => getGlyphOverviewSections(overviewGlyphs, groupBy),
    [groupBy, overviewGlyphs]
  )

  const visibleSections = useMemo(() => {
    if (selectedSectionId === 'all') {
      return sections
    }
    return sections.filter((section) => section.id === selectedSectionId)
  }, [sections, selectedSectionId])

  const activeSection = useMemo(() => {
    if (selectedSectionId === 'all') {
      return {
        id: 'all',
        label: groupBy === 'none' ? '全部字符' : '全部分組結果',
        glyphs: overviewGlyphs,
      }
    }

    return (
      sections.find((section) => section.id === selectedSectionId) ?? {
        id: 'all',
        label: '全部字符',
        glyphs: overviewGlyphs,
      }
    )
  }, [groupBy, overviewGlyphs, sections, selectedSectionId])

  useEffect(() => {
    if (
      selectedSectionId !== 'all' &&
      !sections.some((section) => section.id === selectedSectionId)
    ) {
      setOverviewSectionId('all')
    }
  }, [sections, selectedSectionId, setOverviewSectionId])

  useEffect(() => {
    return () => {
      setOverviewGridState(pendingOverviewGridStateRef.current)
    }
  }, [setOverviewGridState])

  const selectedGlyph =
    overviewGlyphs.find((glyph) => glyph.id === selectedGlyphId) ?? null
  const glyphMap = useMemo(() => fontData?.glyphs ?? {}, [fontData?.glyphs])
  const overviewSelectedGlyphIdSet = useMemo(() => {
    const selectedGlyphIds = new Set(overviewSelectedGlyphIds)
    if (selectedGlyphId) {
      selectedGlyphIds.add(selectedGlyphId)
    }
    return selectedGlyphIds
  }, [overviewSelectedGlyphIds, selectedGlyphId])

  const selectOverviewGlyphs = useCallback(
    (glyphIds: string[], primaryGlyphId: string | null) => {
      setOverviewSelectedGlyphIds(glyphIds)
      setSelectedGlyphId(primaryGlyphId)
    },
    [setSelectedGlyphId]
  )

  const getEditorTextForGlyphIds = useCallback(
    (glyphIds: string[]) =>
      glyphIds
        .map((glyphId) => {
          const unicode = glyphMap[glyphId]?.unicode
          if (!unicode) {
            return ''
          }

          const codePoint = Number.parseInt(unicode, 16)
          return Number.isFinite(codePoint)
            ? String.fromCodePoint(codePoint)
            : ''
        })
        .join(''),
    [glyphMap]
  )

  const handleAddGlyphs = () => {
    const candidates = parseGlyphAdditionInput(glyphInputValue)
    if (candidates.length === 0) {
      toast({
        title: '沒有可新增的字符',
        description: '請輸入字符本身，或用空白分隔的 uniXXXX。',
        status: 'warning',
        duration: 2200,
        isClosable: true,
      })
      return
    }

    const existingGlyphIds = new Set(Object.keys(glyphMap))
    const missingCandidates = candidates.filter(
      (candidate) => !existingGlyphIds.has(candidate.id)
    )
    const addedGlyphIds = addGlyphs(missingCandidates)
    if (addedGlyphIds.length > 0) {
      const primaryGlyphId = addedGlyphIds[0] ?? null
      selectionAnchorGlyphIdRef.current = primaryGlyphId
      selectOverviewGlyphs(
        primaryGlyphId ? [primaryGlyphId] : [],
        primaryGlyphId
      )
      setGlyphInputValue('')
      setIsAddingGlyphs(false)
    }

    const skippedCount = candidates.length - addedGlyphIds.length
    toast({
      title: addedGlyphIds.length > 0 ? '已新增字符' : '沒有新增字符',
      description:
        addedGlyphIds.length > 0
          ? `新增 ${addedGlyphIds.length} 個字符${skippedCount > 0 ? `，略過 ${skippedCount} 個已存在字符` : ''}。`
          : '輸入的字符都已經存在於專案中。',
      status: addedGlyphIds.length > 0 ? 'success' : 'info',
      duration: 2600,
      isClosable: true,
    })
  }

  const handleSectionSelect = (sectionId: string) => {
    pendingOverviewGridStateRef.current = null
    setOverviewGridState(null)
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
      selectionAnchorGlyphIdRef.current = primaryGlyphId
      selectOverviewGlyphs(
        primaryGlyphId ? [primaryGlyphId] : [],
        primaryGlyphId
      )
    }
  }

  const handleOverviewGlyphSelect = useCallback(
    (glyphId: string, event: MouseEvent) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        event.preventDefault()
      }

      const activeGlyphIds = activeSection.glyphs.map((glyph) => glyph.id)
      const currentSelection = overviewSelectedGlyphIds.filter((selectedId) =>
        activeGlyphIds.includes(selectedId)
      )
      const currentSelectionSet = new Set(currentSelection)
      const isToggleSelection = event.metaKey || event.ctrlKey

      if (
        !event.shiftKey &&
        !isToggleSelection &&
        currentSelectionSet.has(glyphId)
      ) {
        setSelectedGlyphId(glyphId)
        return
      }

      const anchorGlyphId =
        selectionAnchorGlyphIdRef.current &&
        activeGlyphIds.includes(selectionAnchorGlyphIdRef.current)
          ? selectionAnchorGlyphIdRef.current
          : (currentSelection.at(-1) ?? selectedGlyphId ?? glyphId)

      if (event.shiftKey) {
        const anchorIndex = activeGlyphIds.indexOf(anchorGlyphId)
        const targetIndex = activeGlyphIds.indexOf(glyphId)
        if (anchorIndex < 0 || targetIndex < 0) {
          selectOverviewGlyphs([glyphId], glyphId)
          selectionAnchorGlyphIdRef.current = glyphId
          return
        }

        const [startIndex, endIndex] =
          anchorIndex < targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex]
        const rangeGlyphIds = activeGlyphIds.slice(startIndex, endIndex + 1)
        const nextSelection = isToggleSelection
          ? Array.from(new Set([...currentSelection, ...rangeGlyphIds]))
          : rangeGlyphIds
        selectOverviewGlyphs(nextSelection, glyphId)
        return
      }

      selectionAnchorGlyphIdRef.current = glyphId

      if (isToggleSelection) {
        const nextSelection = currentSelectionSet.has(glyphId)
          ? currentSelection.filter((selectedId) => selectedId !== glyphId)
          : [...currentSelection, glyphId]
        const primaryGlyphId = currentSelectionSet.has(glyphId)
          ? (nextSelection.at(-1) ?? null)
          : glyphId
        selectOverviewGlyphs(nextSelection, primaryGlyphId)
        return
      }

      selectOverviewGlyphs([glyphId], glyphId)
    },
    [
      activeSection.glyphs,
      overviewSelectedGlyphIds,
      selectOverviewGlyphs,
      selectedGlyphId,
      setSelectedGlyphId,
    ]
  )

  const handleEnterEditor = useCallback(
    (glyphId: string) => {
      setOverviewGridState(pendingOverviewGridStateRef.current)
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
      selectedGlyphId,
      setEditorTextState,
      setOverviewGridState,
      setWorkspaceView,
    ]
  )

  const handleGridStateChange = useCallback((state: GridStateSnapshot) => {
    pendingOverviewGridStateRef.current = state
  }, [])

  const handleGridRangeChange = useCallback(
    (range: ListRange) => {
      setOverviewTopGlyphId(activeSection.glyphs[range.startIndex]?.id ?? null)
    },
    [activeSection.glyphs, setOverviewTopGlyphId]
  )

  return (
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
          groupBy={groupBy}
          glyphInputValue={glyphInputValue}
          isAddingGlyphs={isAddingGlyphs}
          overviewGlyphCount={overviewGlyphs.length}
          projectTitle={projectTitle}
          sections={sections}
          selectedSectionId={selectedSectionId}
          showOnlyEmptyGlyphs={showOnlyEmptyGlyphs}
          onCancelAddGlyphs={() => {
            setGlyphInputValue('')
            setIsAddingGlyphs(false)
          }}
          onCloseProject={closeProjectState}
          onGlyphInputChange={setGlyphInputValue}
          onGlyphInputSubmit={handleAddGlyphs}
          onGroupingChange={(value) => {
            pendingOverviewGridStateRef.current = null
            setOverviewGridState(null)
            setOverviewGrouping(value)
            setOverviewSectionId('all')
          }}
          onSearchQueryChange={setSearchQuery}
          onSectionSelect={handleSectionSelect}
          onShowOnlyEmptyGlyphsChange={setShowOnlyEmptyGlyphs}
          onToggleAddGlyphs={() => setIsAddingGlyphs(true)}
        />
      </GridItem>

      <GridItem area="center" minW={0} minH={0}>
        <OverviewContent
          activeSection={activeSection}
          glyphMap={glyphMap}
          gridRef={gridRef}
          restoreSnapshot={overviewGridState}
          selectedGlyphIds={overviewSelectedGlyphIdSet}
          topGlyphId={overviewTopGlyphId}
          visibleSections={visibleSections}
          onEnterEditor={handleEnterEditor}
          onGridStateChange={handleGridStateChange}
          onRangeChange={handleGridRangeChange}
          onSelectGlyph={handleOverviewGlyphSelect}
        />
      </GridItem>

      <GridItem area="right" minW={0} minH={0}>
        <OverviewRightPanel />
      </GridItem>
    </Grid>
  )
}
