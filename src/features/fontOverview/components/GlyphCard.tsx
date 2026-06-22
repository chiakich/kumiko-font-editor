import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { memo, useCallback, type MouseEvent } from 'react'
import {
  GlyphPreview,
  GlyphPreviewArtwork,
} from 'src/features/common/glyphPreview/GlyphPreview'
import type { GlyphPreviewData } from 'src/lib/glyph/glyphPreviewData'
import type { GlyphData } from 'src/store'

interface GlyphCardProps {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
  preview: GlyphPreviewData | null
  cardHeight: number
  previewHeight: number
  showGlyphName: boolean
  isSelected: boolean
  isTransitioning?: boolean
  onEnterEditor: (glyphId: string) => void
  onSelectGlyph: (glyphId: string, event: MouseEvent) => void
}

export const GlyphCard = memo(function GlyphCard({
  glyph,
  glyphMap,
  preview,
  cardHeight,
  previewHeight,
  showGlyphName,
  isSelected,
  isTransitioning,
  onEnterEditor,
  onSelectGlyph,
}: GlyphCardProps) {
  const handleClick = useCallback(
    (event: MouseEvent) => {
      onSelectGlyph(glyph.id, event)
    },
    [glyph.id, onSelectGlyph]
  )

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault()
    }
  }, [])

  const handleDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      onEnterEditor(glyph.id)
    },
    [glyph.id, onEnterEditor]
  )

  return (
    <Box
      p={1}
      h={`${cardHeight}px`}
      overflow="hidden"
      sx={{ contain: 'layout paint style' }}
      borderRadius="sm"
      bg={isSelected ? 'field.yellow.300' : 'field.panel'}
      boxShadow="none"
      transition="background 60ms ease"
      userSelect="none"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      <Stack spacing={showGlyphName ? 1 : 0} h="100%">
        <Flex
          align="center"
          justify="center"
          h={`${previewHeight}px`}
          minH={0}
          overflow="hidden"
          borderRadius="sm"
        >
          <Box
            data-overview-glyph-preview-id={glyph.id}
            w="100%"
            h="100%"
            style={
              isTransitioning
                ? { viewTransitionName: 'glyph-preview' }
                : undefined
            }
          >
            {preview ? (
              <GlyphPreviewArtwork glyph={glyph} preview={preview} />
            ) : (
              <GlyphPreview glyph={glyph} glyphMap={glyphMap} />
            )}
          </Box>
        </Flex>

        {showGlyphName ? (
          <Text
            fontSize="xs"
            color="field.muted"
            noOfLines={1}
            textAlign="center"
            fontFamily="mono"
          >
            {glyph.id}
          </Text>
        ) : null}
      </Stack>
    </Box>
  )
})
