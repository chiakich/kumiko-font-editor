import { Box } from '@chakra-ui/react'
import { useMemo } from 'react'
import { buildGlyphPreviewData } from 'src/lib/glyph/glyphOverview'
import { useStore, type GlyphData } from 'src/store'

// Flip baseline tuned for a 1000-UPM design space; scaled by the font's UPM.
const READONLY_FLIP_OFFSET = 680
const READONLY_UNITS_PER_EM = 1000

interface InlineGlyphPreviewProps {
  glyph: GlyphData
  glyphMap: Record<string, GlyphData>
}

export function InlineGlyphPreview({
  glyph,
  glyphMap,
}: InlineGlyphPreviewProps) {
  const unitsPerEm = useStore((state) => state.fontData?.unitsPerEm)
  const preview = useMemo(
    () => buildGlyphPreviewData(glyph, glyphMap, unitsPerEm),
    [glyph, glyphMap, unitsPerEm]
  )
  const flipOffset =
    (READONLY_FLIP_OFFSET * (unitsPerEm || READONLY_UNITS_PER_EM)) /
    READONLY_UNITS_PER_EM

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
      <g transform={`translate(0 ${flipOffset}) scale(1 -1)`}>
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
