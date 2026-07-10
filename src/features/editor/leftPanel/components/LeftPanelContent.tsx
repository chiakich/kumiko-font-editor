import { HStack, Stack, Text, VStack, Separator } from '@chakra-ui/react'
import { useCallback, useEffect, useRef } from 'react'
import type { ListRange } from 'react-virtuoso'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import { loadProjectGlyphGeometryClosure } from 'src/lib/project/projectRepository'
import { useStore, type GlyphData } from 'src/store'
import { ComponentSearchSection } from 'src/features/editor/leftPanel/components/ComponentSearchSection'
import { GlyphPreviewCard } from 'src/features/editor/leftPanel/components/GlyphPreviewCard'
import { GlyphPreviewStrip } from 'src/features/editor/leftPanel/components/GlyphPreviewStrip'
import { LeftPanelHeader } from 'src/features/editor/leftPanel/components/LeftPanelHeader'
import { useGlyphReferenceSearch } from 'src/features/editor/leftPanel/hooks/useGlyphReferenceSearch'

interface LeftPanelContentProps {
  glyphMap: Record<string, GlyphData>
  glyphs: GlyphData[]
  selectedGlyph: GlyphData | null
}

export function LeftPanelContent({
  glyphMap,
  glyphs,
  selectedGlyph,
}: LeftPanelContentProps) {
  const projectId = useStore((state) => state.projectId)
  const hydrateGlyphGeometry = useStore((state) => state.hydrateGlyphGeometry)
  const setEditorReferenceGlyphIds = useStore(
    (state) => state.setEditorReferenceGlyphIds
  )
  const loadingRef = useRef(new Map<string, Promise<GlyphData[]>>())
  const visibleReferenceGlyphIdsRef = useRef<string[]>([])

  const {
    isCjkGlyph,
    loading,
    previewGlyph,
    resultGlyphs,
    searchState,
    selectedComponent,
    partBoxesByComponent,
    setPreviewGlyphId,
    setSelectedComponent,
  } = useGlyphReferenceSearch({
    glyphs,
    glyphMap,
    selectedGlyph,
  })

  const loadGeometry = useCallback(
    (glyphIds: string[]) => {
      if (!projectId) return
      const currentGlyphs = useStore.getState().fontData?.glyphs ?? {}
      const missing = glyphIds
        .filter((id) => {
          const g = currentGlyphs[id]
          return g && !isGlyphGeometryLoaded(g)
        })
        .filter((id) => !loadingRef.current.has(id))
      if (missing.length === 0) return
      const loadedGlyphIds = Object.values(currentGlyphs)
        .filter(isGlyphGeometryLoaded)
        .map((g) => g.id)
      const loadPromise = loadProjectGlyphGeometryClosure(projectId, missing, {
        loadedGlyphIds,
      }).finally(() => {
        for (const id of missing) loadingRef.current.delete(id)
      })
      for (const id of missing) loadingRef.current.set(id, loadPromise)
      void loadPromise.then((loaded) => {
        if (useStore.getState().projectId === projectId) {
          hydrateGlyphGeometry(loaded)
        }
      })
    },
    [projectId, hydrateGlyphGeometry]
  )

  const handleStripRangeChange = useCallback(
    (range: ListRange) => {
      const ids = resultGlyphs
        .slice(range.startIndex, range.endIndex + 1)
        .map((g) => g.id)
      visibleReferenceGlyphIdsRef.current = ids
      setEditorReferenceGlyphIds(previewGlyph ? [previewGlyph.id, ...ids] : ids)
      loadGeometry(ids)
    },
    [loadGeometry, previewGlyph, resultGlyphs, setEditorReferenceGlyphIds]
  )

  useEffect(() => {
    const ids = previewGlyph
      ? [previewGlyph.id, ...visibleReferenceGlyphIdsRef.current]
      : visibleReferenceGlyphIdsRef.current
    setEditorReferenceGlyphIds(ids)
    if (previewGlyph) loadGeometry([previewGlyph.id])
  }, [previewGlyph, loadGeometry, setEditorReferenceGlyphIds])

  useEffect(
    () => () => {
      setEditorReferenceGlyphIds([])
    },
    [setEditorReferenceGlyphIds]
  )

  return (
    <>
      <VStack align="stretch" gap={3} mb={4}>
        <LeftPanelHeader
          hasSelectedGlyph={Boolean(selectedGlyph)}
          isCjkGlyph={isCjkGlyph}
        />

        {isCjkGlyph && selectedGlyph ? (
          <ComponentSearchSection
            components={searchState.components}
            loading={loading}
            selectedComponent={selectedComponent ?? searchState.activeComponent}
            partBoxesByComponent={partBoxesByComponent ?? undefined}
            onSelectComponent={setSelectedComponent}
          />
        ) : null}

        <HStack justify="space-between" align="center">
          <Text fontSize="sm" color="mutedForeground" fontFamily="mono">
            {isCjkGlyph ? '含此部件的字符' : '相關字符'}{' '}
            {resultGlyphs.length.toLocaleString()}
          </Text>
        </HStack>
      </VStack>
      <Separator mb={4} borderColor="haze" opacity={0.55} />
      <Stack height="100%" minH={0} gap={3}>
        <GlyphPreviewStrip
          glyphMap={glyphMap}
          previewGlyphId={previewGlyph?.id ?? null}
          resultGlyphs={resultGlyphs}
          onPreviewGlyphChange={setPreviewGlyphId}
          onRangeChange={handleStripRangeChange}
        />

        <GlyphPreviewCard glyph={previewGlyph} glyphMap={glyphMap} />
      </Stack>
      {searchState.error ? (
        <Text mt={3} fontSize="sm" color="destructive">
          {searchState.error}
        </Text>
      ) : null}
    </>
  )
}
