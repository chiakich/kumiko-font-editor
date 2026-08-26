import { Box } from '@chakra-ui/react'
import type { ShapedGlyph } from 'src/lib/openTypeFeatures'

interface ShapedRunSvgProps {
  glyphs: readonly ShapedGlyph[]
  unitsPerEm: number
  // Pixel height of the rendered em box.
  size: number
}

// Walks the pen across the run: each glyph sits at pen + its offsets, then the
// pen advances. Lives outside the component so render stays reassignment-free.
const placeRun = (glyphs: readonly ShapedGlyph[]) => {
  let penX = 0
  let penY = 0
  const placed = glyphs.map((glyph, index) => {
    const x = penX + glyph.xOffset
    const y = penY + glyph.yOffset
    penX += glyph.xAdvance
    penY += glyph.yAdvance
    return { glyph, x, y, key: index }
  })
  return { placed, advanceWidth: penX }
}

// Draws a shaped run from HarfBuzz output: pen advances plus per-glyph offsets,
// outlines straight from the compiled font. Font units are y-up, SVG is y-down,
// hence the single flip on the run group.
export function ShapedRunSvg({ glyphs, unitsPerEm, size }: ShapedRunSvgProps) {
  const ascent = unitsPerEm * 0.88
  const descent = unitsPerEm * 0.24
  const { placed, advanceWidth } = placeRun(glyphs)
  const width = Math.max(advanceWidth, 1)
  const height = ascent + descent
  const pixelWidth = (width / height) * size

  return (
    <Box
      as="svg"
      display="block"
      width={`${pixelWidth}px`}
      height={`${size}px`}
      flexShrink={0}
      // @ts-expect-error chakra Box does not type svg attributes
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <g transform={`translate(0, ${ascent}) scale(1, -1)`}>
        {placed.map(({ glyph, x, y, key }) =>
          glyph.svgPath ? (
            <path
              key={key}
              d={glyph.svgPath}
              transform={`translate(${x}, ${y})`}
              fill="currentColor"
            />
          ) : null
        )}
      </g>
    </Box>
  )
}
