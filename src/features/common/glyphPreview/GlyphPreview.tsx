import { Box, Flex, Text } from '@chakra-ui/react'
import { memo, useMemo } from 'react'
import {
  buildGlyphPreviewData,
  getGlyphDisplayCharacter,
} from 'src/lib/glyph/glyphOverview'
import type { GlyphPreviewData } from 'src/lib/glyph/glyphPreviewData'
import { useStore, type GlyphData } from 'src/store'

interface GlyphPreviewProps {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
  inheritFallbackColor?: boolean
}

interface GlyphPreviewArtworkProps {
  glyph: GlyphData
  inheritFallbackColor?: boolean
  preview: GlyphPreviewData | null
}

export const GlyphPreviewArtwork = memo(function GlyphPreviewArtwork({
  glyph,
  inheritFallbackColor = false,
  preview,
}: GlyphPreviewArtworkProps) {
  const displayCharacter =
    getGlyphDisplayCharacter(glyph) ?? glyph.name ?? glyph.id

  if (!preview?.shapes.length) {
    return (
      <Flex w="100%" h="100%" align="center" justify="center">
        <Text
          w="100%"
          textAlign="center"
          fontSize={displayCharacter.length > 1 ? 'sm' : '6xl'}
          fontWeight="900"
          color={inheritFallbackColor ? 'currentColor' : 'field.haze'}
          lineHeight={1}
          userSelect="none"
        >
          {displayCharacter}
        </Text>
      </Flex>
    )
  }

  return (
    <Box
      as="svg"
      viewBox={preview.viewBox}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
    >
      <g transform={`matrix(1 0 0 -1 0 ${preview.flipY})`}>
        {preview.shapes.map((shape, index) => (
          <path
            key={`${glyph.id}-shape-${index}`}
            d={shape.d}
            transform={shape.transform}
            fill="currentColor"
            stroke="none"
          />
        ))}
      </g>
    </Box>
  )
})

export const GlyphPreview = memo(function GlyphPreview({
  glyph,
  glyphMap,
  inheritFallbackColor = false,
}: GlyphPreviewProps) {
  const unitsPerEm = useStore((state) => state.fontData?.unitsPerEm)
  const activeMasterId = useStore((state) => state.activeMasterId)
  // Render the active master's layer (null -> the glyph's own active layer).
  const preview = useMemo(
    () => buildGlyphPreviewData(glyph, glyphMap, unitsPerEm, activeMasterId),
    [glyph, glyphMap, unitsPerEm, activeMasterId]
  )
  return (
    <GlyphPreviewArtwork
      glyph={glyph}
      inheritFallbackColor={inheritFallbackColor}
      preview={preview}
    />
  )
})
