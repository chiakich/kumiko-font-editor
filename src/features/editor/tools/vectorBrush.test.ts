import { describe, expect, it } from 'vitest'
import {
  appendBrushSample,
  buildVectorBrushOutline,
  clampPressure,
} from 'src/features/editor/tools/vectorBrush'

describe('vector brush geometry', () => {
  it('interpolates sparse pointer samples without losing the final pressure', () => {
    const samples = appendBrushSample(
      [{ x: 0, y: 0, pressure: 0.25 }],
      { x: 12, y: 0, pressure: 0.9 },
      4
    )

    expect(samples).toEqual([
      { x: 0, y: 0, pressure: 0.25 },
      { x: 4, y: 0, pressure: expect.closeTo(0.4666666667) },
      { x: 8, y: 0, pressure: expect.closeTo(0.6833333333) },
      { x: 12, y: 0, pressure: 0.9 },
    ])
  })

  it('turns the centreline into a closed, pressure-varying outline', () => {
    const outline = buildVectorBrushOutline(
      [
        { x: 0, y: 0, pressure: 0.2 },
        { x: 50, y: 0, pressure: 1 },
      ],
      100
    )

    // Two rails plus two intermediate points per round cap.
    expect(outline).toHaveLength(8)
    expect(outline[0]!.y).toBeGreaterThan(0)
    expect(outline[1]!.y).toBeGreaterThan(outline[0]!.y)
    expect(outline[4]!.y).toBeLessThan(0)
    expect(outline[5]!.y).toBeLessThan(0)
  })

  it('uses a stable visible pressure when the input device has none', () => {
    expect(clampPressure(undefined)).toBe(0.5)
    expect(clampPressure(0)).toBeGreaterThan(0)
    expect(clampPressure(2)).toBe(1)
  })
})
