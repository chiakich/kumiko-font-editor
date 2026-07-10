import { describe, expect, it } from 'vitest'
import {
  computePartSpacingMetrics,
  deriveSemanticPartLayout,
  type SemanticPartLayout,
} from 'src/lib/qualityCheck/partSpacingMetrics'
import type { GeometryPoint } from 'src/lib/qualityCheck/polygonGeometry'
import { computeRasterPartSpacingMetrics } from 'src/lib/qualityCheck/rasterPartSpacingMetrics'

const square = (
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): GeometryPoint[] => [
  { x: xMin, y: yMin },
  { x: xMax, y: yMin },
  { x: xMax, y: yMax },
  { x: xMin, y: yMax },
]

describe('semantic part layout', () => {
  it('recognizes horizontal and vertical two-part structures', () => {
    expect(
      deriveSemanticPartLayout([
        { char: '女', box: { x1: 15, y1: 16, x2: 90, y2: 186 }, variant: null },
        {
          char: '子',
          box: { x1: 85, y1: 28, x2: 189, y2: 183 },
          variant: null,
        },
      ])
    ).toMatchObject({
      axis: 'horizontal',
      firstCharacter: '女',
      secondCharacter: '子',
    })
    expect(
      deriveSemanticPartLayout([
        { char: '日', box: { x1: 20, y1: 10, x2: 180, y2: 90 }, variant: null },
        {
          char: '月',
          box: { x1: 25, y1: 105, x2: 175, y2: 190 },
          variant: null,
        },
      ])
    ).toMatchObject({
      axis: 'vertical',
      firstCharacter: '日',
      secondCharacter: '月',
    })
  })

  it('rejects diagonal and multi-part layouts', () => {
    expect(
      deriveSemanticPartLayout([
        { char: 'A', box: { x1: 10, y1: 10, x2: 70, y2: 70 }, variant: null },
        {
          char: 'B',
          box: { x1: 120, y1: 120, x2: 190, y2: 190 },
          variant: null,
        },
      ])
    ).toBeNull()
  })
})

describe('part interface spacing', () => {
  const horizontal: SemanticPartLayout = {
    axis: 'horizontal',
    firstCharacter: 'A',
    secondCharacter: 'B',
    splitRatio: 0.5,
  }

  it('measures the median opposing-edge gap instead of a global blank column', () => {
    const base = computePartSpacingMetrics(
      [square(0, 0, 40, 100), square(60, 0, 100, 100)],
      { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
      horizontal
    )
    const widened = computePartSpacingMetrics(
      [square(0, 0, 30, 100), square(70, 0, 100, 100)],
      { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
      horizontal
    )
    expect(base?.gapRatio).toBeCloseTo(0.2)
    expect(widened?.gapRatio).toBeCloseTo(0.4)
  })

  it('stays useful when a minority of scanlines cross the interface', () => {
    const metrics = computePartSpacingMetrics(
      [
        square(0, 0, 40, 100),
        square(60, 0, 100, 100),
        // A short cross-interface stroke is assigned to the first group.
        square(35, 45, 65, 55),
      ],
      { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
      horizontal
    )
    expect(metrics?.gapRatio).toBeCloseTo(0.2)
    expect(metrics?.overlapRatio).toBeGreaterThan(0)
  })
})

describe('raster part interface spacing', () => {
  const horizontal: SemanticPartLayout = {
    axis: 'horizontal',
    firstCharacter: 'A',
    secondCharacter: 'B',
    splitRatio: 0.5,
  }

  it('measures a clean two-part gap from the occupancy mask', () => {
    const metrics = computeRasterPartSpacingMetrics(
      [square(0, 0, 40, 100), square(60, 0, 100, 100)],
      { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
      horizontal
    )
    expect(metrics?.gapRatio).toBeCloseTo(0.18, 1)
    expect(metrics?.overlapRatio).toBe(0)
    expect(metrics?.separationRatio).toBeGreaterThan(0.5)
  })

  it('turns a cross-interface stroke into local touching instead of a negative gap', () => {
    const polygons = [
      square(0, 0, 40, 100),
      square(60, 0, 100, 100),
      square(35, 20, 70, 80),
    ]
    const contour = computePartSpacingMetrics(
      polygons,
      { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
      horizontal
    )
    const raster = computeRasterPartSpacingMetrics(
      polygons,
      { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
      horizontal
    )
    expect(contour?.gapRatio).toBeLessThan(0)
    expect(raster?.gapRatio).toBeGreaterThanOrEqual(0)
    expect(raster?.overlapRatio).toBeGreaterThan(0.5)
  })
})
