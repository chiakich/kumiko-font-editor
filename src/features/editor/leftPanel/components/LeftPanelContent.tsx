import { Divider, HStack, Stack, Text, VStack } from '@chakra-ui/react'
import { useEffect, useMemo, useRef } from 'react'
import {
  getFontVerticalBox,
  mapGlyphwikiBoxToFontUnits,
} from 'src/lib/components/componentAssembly'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import { loadProjectGlyphGeometryClosure } from 'src/lib/project/projectRepository'
import { useStore, activeLayer, type GlyphData } from 'src/store'
import { ComponentSearchSection } from 'src/features/editor/leftPanel/components/ComponentSearchSection'
import { GlyphPreviewCard } from 'src/features/editor/leftPanel/components/GlyphPreviewCard'
import { GlyphPreviewStrip } from 'src/features/editor/leftPanel/components/GlyphPreviewStrip'
import { LeftPanelHeader } from 'src/features/editor/leftPanel/components/LeftPanelHeader'
import { useGlyphReferenceSearch } from 'src/features/editor/leftPanel/hooks/useGlyphReferenceSearch'

interface LeftPanelContentProps {
  glyphMap: Record<string, GlyphData>
  glyphs: GlyphData[]
  selectedGlyph: GlyphData | null
  onAddGlyphToEditor: (glyphId: string) => void
  onBack: () => void
}

export function LeftPanelContent({
  glyphMap,
  glyphs,
  selectedGlyph,
  onAddGlyphToEditor,
  onBack,
}: LeftPanelContentProps) {
  const fontData = useStore((state) => state.fontData)
  const projectId = useStore((state) => state.projectId)
  const hydrateGlyphGeometry = useStore((state) => state.hydrateGlyphGeometry)
  const loadingRef = useRef(new Map<string, Promise<GlyphData[]>>())

  const {
    isCjkGlyph,
    loading,
    previewGlyph,
    resultGlyphs,
    searchState,
    selectedComponent,
    targetPartBox,
    partBoxesByComponent,
    setPreviewGlyphId,
    setSelectedComponent,
  } = useGlyphReferenceSearch({
    glyphs,
    glyphMap,
    selectedGlyph,
  })

  // Where the active component should land inside the edited glyph,
  // in font units; null when GlyphWiki has no layout for this character.
  const targetRect = useMemo(() => {
    if (!targetPartBox || !selectedGlyph || !fontData) {
      return null
    }
    const advanceWidth =
      activeLayer(selectedGlyph).metrics.width || fontData.unitsPerEm || 1000
    return mapGlyphwikiBoxToFontUnits(
      targetPartBox,
      advanceWidth,
      getFontVerticalBox(fontData)
    )
  }, [fontData, selectedGlyph, targetPartBox])

  useEffect(() => {
    if (!projectId) {
      return
    }
    const missing = resultGlyphs
      .filter((glyph) => !isGlyphGeometryLoaded(glyph))
      .map((glyph) => glyph.id)
      .filter((id) => !loadingRef.current.has(id))
    if (missing.length === 0) {
      return
    }
    const currentState = useStore.getState()
    const loadedGlyphIds = Object.values(currentState.fontData?.glyphs ?? {})
      .filter(isGlyphGeometryLoaded)
      .map((g) => g.id)
    const loadPromise = loadProjectGlyphGeometryClosure(projectId, missing, {
      loadedGlyphIds,
    }).finally(() => {
      for (const id of missing) {
        loadingRef.current.delete(id)
      }
    })
    for (const id of missing) {
      loadingRef.current.set(id, loadPromise)
    }
    void loadPromise.then((loaded) => {
      if (useStore.getState().projectId === projectId) {
        hydrateGlyphGeometry(loaded)
      }
    })
  }, [hydrateGlyphGeometry, projectId, resultGlyphs])

  return (
    <>
      <VStack align="stretch" spacing={3} mb={4}>
        <LeftPanelHeader
          hasSelectedGlyph={Boolean(selectedGlyph)}
          isCjkGlyph={isCjkGlyph}
          onBack={onBack}
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
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            {isCjkGlyph ? '含此部件的字符' : '相關字符'}{' '}
            {resultGlyphs.length.toLocaleString()}
          </Text>
        </HStack>
      </VStack>

      <Divider mb={4} borderColor="field.haze" opacity={0.55} />

      <Stack height="100%" minH={0} spacing={3}>
        <GlyphPreviewStrip
          glyphMap={glyphMap}
          previewGlyphId={previewGlyph?.id ?? null}
          resultGlyphs={resultGlyphs}
          onPreviewGlyphChange={setPreviewGlyphId}
        />

        <GlyphPreviewCard
          glyph={previewGlyph}
          glyphMap={glyphMap}
          targetRect={targetRect}
          onAddToEditor={onAddGlyphToEditor}
        />
      </Stack>

      {searchState.error ? (
        <Text mt={3} fontSize="sm" color="field.red.400">
          {searchState.error}
        </Text>
      ) : null}
    </>
  )
}
