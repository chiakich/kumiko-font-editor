import { buildGlyphPreviewData } from '@/lib/glyph/glyphOverview'
import type { GlyphPreviewShape } from '@/lib/glyph/glyphPreviewData'
import { getGlyphLayer } from '@/domain/glyphLayer'
import type { FontData } from '@/domain'

export interface PairSpacingGlyph {
  key: string
  offsetX: number
  // The right glyph at its un-kerned position, drawn faintly behind the pair.
  isGhost: boolean
  shapes: GlyphPreviewShape[]
}

export interface PairSpacingLayout {
  viewBox: string
  flipY: number
  glyphs: PairSpacingGlyph[]
}

// Lays out a kerning pair from project data alone: the two outlines, their
// advances, and the kerning value between them. This is the same arithmetic
// the canvas runs (buildPositionedGlyphs), so the panel and the canvas agree.
export const buildPairSpacingLayout = (
  fontData: FontData,
  leftGlyphId: string,
  rightGlyphId: string,
  activeMasterId: string | null,
  kerning: number
): PairSpacingLayout | null => {
  const left = fontData.glyphs[leftGlyphId]
  const right = fontData.glyphs[rightGlyphId]
  if (!left || !right) {
    return null
  }

  const unitsPerEm = fontData.unitsPerEm
  const leftPreview = buildGlyphPreviewData(
    left,
    fontData.glyphs,
    unitsPerEm,
    activeMasterId
  )
  const rightPreview = buildGlyphPreviewData(
    right,
    fontData.glyphs,
    unitsPerEm,
    activeMasterId
  )
  const leftAdvance = getGlyphLayer(left, activeMasterId)?.metrics.width ?? 0
  const rightAdvance = getGlyphLayer(right, activeMasterId)?.metrics.width ?? 0

  const glyphs: PairSpacingGlyph[] = [
    { key: 'left', offsetX: 0, isGhost: false, shapes: leftPreview.shapes },
  ]
  if (kerning !== 0) {
    glyphs.push({
      key: 'right-unkerned',
      offsetX: leftAdvance,
      isGhost: true,
      shapes: rightPreview.shapes,
    })
  }
  glyphs.push({
    key: 'right',
    offsetX: leftAdvance + kerning,
    isGhost: false,
    shapes: rightPreview.shapes,
  })

  // Reuse the single-glyph frame's padding and vertical extent so the pair
  // sits on the same baseline at the same scale as every other preview.
  const [frameX, frameY, , frameHeight] = leftPreview.viewBox
    .split(' ')
    .map(Number)
  const paddingX = -frameX
  // Kerning tight enough to pull the right glyph past the origin has to widen
  // the frame leftwards too, or the SVG clips what the pair is being judged on.
  const minX = Math.min(0, leftAdvance + kerning)
  const maxX = Math.max(
    leftAdvance + rightAdvance,
    leftAdvance + kerning + rightAdvance,
    leftAdvance,
    minX + 1
  )

  return {
    viewBox: `${minX - paddingX} ${frameY} ${maxX - minX + paddingX * 2} ${frameHeight}`,
    flipY: leftPreview.flipY,
    glyphs,
  }
}
