import { Box } from '@chakra-ui/react'
import { useMemo } from 'react'
import { buildGlyphPreviewData } from 'src/lib/glyphOverview'
import type { GlyphData } from 'src/store'

const READONLY_FLIP_OFFSET = 680

interface InlineGlyphPreviewProps {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
}

export function InlineGlyphPreview({
  glyph,
  glyphMap,
}: InlineGlyphPreviewProps) {
  const preview = useMemo(
    () => buildGlyphPreviewData(glyph, glyphMap),
    [glyph, glyphMap]
  )

  return (
    <Box
      as="svg"
      viewBox={preview.viewBox}
      width="1.4em"
      height="1.4em"
      display="inline-block"
      verticalAlign="middle"
      overflow="visible"
      fill="currentColor"
      flexShrink={0}
    >
      <g transform={`translate(0 ${READONLY_FLIP_OFFSET}) scale(1 -1)`}>
        {preview.shapes.map((shape, index) => (
          <path
            key={`${glyph.id}-inline-${index}`}
            d={shape.d}
            transform={shape.transform}
            fill="currentColor"
          />
        ))}
      </g>
    </Box>
  )
}
