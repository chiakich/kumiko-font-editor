import { Box, Flex, Stack, Text } from '@chakra-ui/react'
import { memo, useCallback, type MouseEvent } from 'react'
import {
  GlyphPreview,
  GlyphPreviewArtwork,
} from 'src/features/common/glyphPreview/GlyphPreview'
import { kumikoColorToCssRgba } from 'src/lib/color/kumikoColor'
import type { GlyphPreviewData } from 'src/lib/glyph/glyphPreviewData'
import type { GlyphColorLabelDisplayMode } from 'src/lib/preferences/appPreferences'
import type { GlyphData } from 'src/store'

interface GlyphCardProps {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
  preview: GlyphPreviewData | null
  cardHeight: number
  colorLabelDisplayMode: GlyphColorLabelDisplayMode
  previewHeight: number
  showGlyphName: boolean
  isSelected: boolean
  isTransitioning?: boolean
  onEnterEditor: (glyphId: string) => void
  onOpenContextMenu: (glyphId: string, event: MouseEvent) => void
  onSelectGlyph: (glyphId: string, event: MouseEvent) => void
}

export const GlyphCard = memo(function GlyphCard({
  glyph,
  glyphMap,
  preview,
  cardHeight,
  colorLabelDisplayMode,
  previewHeight,
  showGlyphName,
  isSelected,
  isTransitioning,
  onEnterEditor,
  onOpenContextMenu,
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
  const handleContextMenu = useCallback(
    (event: MouseEvent) => {
      onOpenContextMenu(glyph.id, event)
    },
    [glyph.id, onOpenContextMenu]
  )

  const hasFullCardColor = Boolean(
    glyph.color && colorLabelDisplayMode === 'card'
  )
  const showColorDot = Boolean(glyph.color && colorLabelDisplayMode === 'dot')
  const cardColorOverlay = glyph.color
    ? `linear-gradient(${kumikoColorToCssRgba(
        glyph.color,
        0.6
      )}, ${kumikoColorToCssRgba(glyph.color, 0.6)})`
    : undefined

  return (
    <Box
      p={1}
      h={`${cardHeight}px`}
      overflow="hidden"
      css={{
        contain: 'layout paint style',
      }}
      position="relative"
      borderRadius="sm"
      bg={isSelected ? 'field.yellow.400' : 'field.panel'}
      // selected chip is always yellow → force fixed dark ink so the glyph
      // (fill=currentColor) and label stay readable in dark mode too
      color={isSelected ? 'field.onColor' : undefined}
      bgImage={hasFullCardColor && !isSelected ? cardColorOverlay : undefined}
      boxShadow="none"
      transition="background 60ms ease"
      userSelect="none"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {showColorDot && glyph.color ? (
        <Box
          position="absolute"
          top="5px"
          right="5px"
          zIndex={1}
          w="10px"
          h="10px"
          borderRadius="full"
          bg={kumikoColorToCssRgba(glyph.color)}
          boxShadow="0 0 0 1px rgba(8, 11, 13, 0.36), 0 0 0 2px rgba(255, 255, 255, 0.72)"
          pointerEvents="none"
        />
      ) : null}
      <Stack gap={showGlyphName ? 1 : 0} h="100%">
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
            color={isSelected ? 'field.onColor' : 'field.muted'}
            lineClamp={1}
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
