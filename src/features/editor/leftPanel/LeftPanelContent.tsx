import { Divider, HStack, Stack, Text, VStack } from '@chakra-ui/react'
import { useEffect, useMemo } from 'react'
import {
  getFontVerticalBox,
  mapGlyphwikiBoxToFontUnits,
} from 'src/lib/componentAssembly'
import { useStore, type GlyphData } from 'src/store'
import { ComponentSearchSection } from 'src/features/editor/leftPanel/ComponentSearchSection'
import { GlyphPreviewCard } from 'src/features/editor/leftPanel/GlyphPreviewCard'
import { GlyphPreviewStrip } from 'src/features/editor/leftPanel/GlyphPreviewStrip'
import { LeftPanelHeader } from 'src/features/editor/leftPanel/LeftPanelHeader'
import { useGlyphReferenceSearch } from 'src/features/editor/leftPanel/useGlyphReferenceSearch'

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
  const setComponentTargetRect = useStore(
    (state) => state.setComponentTargetRect
  )
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
      selectedGlyph.metrics.width || fontData.unitsPerEm || 1000
    return mapGlyphwikiBoxToFontUnits(
      targetPartBox,
      advanceWidth,
      getFontVerticalBox(fontData)
    )
  }, [fontData, selectedGlyph, targetPartBox])

  // Mirror the destination region into the editor canvas so it's obvious
  // which position is being searched.
  useEffect(() => {
    setComponentTargetRect(targetRect)
    return () => setComponentTargetRect(null)
  }, [setComponentTargetRect, targetRect])

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
