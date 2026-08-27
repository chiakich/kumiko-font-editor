import { Box } from '@chakra-ui/react'
import type { ShapedGlyph } from 'src/lib/openTypeFeatures'

export interface ShapedRunSvgProps {
  glyphs: readonly ShapedGlyph[]
  unitsPerEm: number
  // Pixel size of the run's cross axis: height for horizontal, width for
  // vertical.
  size: number
  direction?: 'ltr' | 'ttb'
  // Index of the glyph to highlight, and a click hook for trace panels.
  selectedIndex?: number | null
  onSelectGlyph?: (index: number) => void
  highlightIndices?: ReadonlySet<number>
}

// Walks the pen across the run: each glyph sits at pen + its offsets, then the
// pen advances. Lives outside the component so render stays reassignment-free.
const placeRun = (glyphs: readonly ShapedGlyph[]) => {
  let penX = 0
  let penY = 0
  const placed = glyphs.map((glyph, index) => {
    const x = penX + glyph.xOffset
    const y = penY + glyph.yOffset
    const startX = penX
    const startY = penY
    penX += glyph.xAdvance
    penY += glyph.yAdvance
    return { glyph, x, y, startX, startY, index }
  })
  return { placed, advanceX: penX, advanceY: penY }
}

// Draws a shaped run from HarfBuzz output: pen advances plus per-glyph offsets,
// outlines straight from the compiled font. Font units are y-up, SVG is y-down,
// hence the single flip on the run group. Vertical runs advance the pen down
// (negative y) with glyphs centred on the vertical baseline at x = 0.
export function ShapedRunSvg({
  glyphs,
  unitsPerEm,
  size,
  direction = 'ltr',
  selectedIndex = null,
  onSelectGlyph,
  highlightIndices,
}: ShapedRunSvgProps) {
  const { placed, advanceX, advanceY } = placeRun(glyphs)
  const isVertical = direction === 'ttb'

  const ascent = unitsPerEm * 0.88
  const descent = unitsPerEm * 0.24
  // Vertical: glyphs are centred on x = 0, so the run occupies ±0.6 em.
  const halfColumn = unitsPerEm * 0.6

  const width = isVertical ? halfColumn * 2 : Math.max(advanceX, 1)
  const height = isVertical ? Math.max(-advanceY, 1) : ascent + descent
  const pixelWidth = isVertical ? size : (width / height) * size
  const pixelHeight = isVertical ? (height / width) * size : size
  const groupTransform = isVertical
    ? `translate(${halfColumn}, 0) scale(1, -1)`
    : `translate(0, ${ascent}) scale(1, -1)`
  // Cluster hitboxes span the glyph's own advance from its pen position, so
  // blank punctuation is still clickable for the trace panel.
  const hitboxFor = (startX: number, startY: number, glyph: ShapedGlyph) =>
    isVertical
      ? {
          x: -halfColumn,
          y: startY + Math.min(glyph.yAdvance, -1),
          w: halfColumn * 2,
          h: Math.max(-glyph.yAdvance, 1),
        }
      : {
          x: startX,
          y: -descent,
          w: Math.max(glyph.xAdvance, unitsPerEm * 0.2),
          h: ascent + descent,
        }

  return (
    <Box
      as="svg"
      display="block"
      width={`${pixelWidth}px`}
      height={`${pixelHeight}px`}
      flexShrink={0}
      // @ts-expect-error chakra Box does not type svg attributes
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <g transform={groupTransform}>
        {placed.map(({ glyph, x, y, startX, startY, index }) => {
          const isSelected = selectedIndex === index
          const isHighlighted = highlightIndices?.has(index) ?? false
          const box = hitboxFor(startX, startY, glyph)
          return (
            <g key={index}>
              {isSelected || isHighlighted ? (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill={
                    isSelected
                      ? 'rgba(255, 251, 66, 0.16)'
                      : 'rgba(255, 251, 66, 0.07)'
                  }
                  stroke={isSelected ? '#FFFB42' : 'rgba(255, 251, 66, 0.5)'}
                  strokeWidth={unitsPerEm * 0.012}
                  rx={unitsPerEm * 0.04}
                />
              ) : null}
              {glyph.svgPath ? (
                <path
                  d={glyph.svgPath}
                  transform={`translate(${x}, ${y})`}
                  fill="currentColor"
                />
              ) : null}
              {onSelectGlyph ? (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectGlyph(index)}
                />
              ) : null}
            </g>
          )
        })}
      </g>
    </Box>
  )
}
