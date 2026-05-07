import { Divider, HStack, Stack, Text, VStack } from '@chakra-ui/react'
import type { GlyphData } from 'src/store'
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
  const {
    isCjkGlyph,
    loading,
    previewGlyph,
    resultGlyphs,
    searchState,
    selectedComponent,
    setPreviewGlyphId,
    setSelectedComponent,
  } = useGlyphReferenceSearch({
    glyphs,
    glyphMap,
    selectedGlyph,
  })

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
