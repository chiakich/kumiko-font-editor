import { describe, expect, it } from 'vitest'
import {
  computePartBoxPlacement,
  extractPartPaths,
  getFontVerticalBox,
  getPathsBounds,
  groupPathsByPartBoxes,
  mapGlyphwikiBoxToFontUnits,
  scorePartFit,
  transformPaths,
} from 'src/lib/components/componentAssembly'
import type { PathData } from 'src/store'

const makeRectPath = (
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number
): PathData => ({
  id: 'p',
  closed: true,
  nodes: [
    { id: 'n1', x: xMin, y: yMin, kind: 'oncurve', segmentType: 'line' },
    { id: 'n2', x: xMax, y: yMin, kind: 'oncurve', segmentType: 'line' },
    { id: 'n3', x: xMax, y: yMax, kind: 'oncurve', segmentType: 'line' },
    { id: 'n4', x: xMin, y: yMax, kind: 'oncurve', segmentType: 'line' },
  ],
})

describe('mapGlyphwikiBoxToFontUnits', () => {
  it('maps the 200x200 canvas onto the em box with y flipped', () => {
    const rect = mapGlyphwikiBoxToFontUnits(
      { x1: 0, y1: 0, x2: 200, y2: 200 },
      1000,
      { top: 880, bottom: -120 }
    )
    expect(rect).toEqual({ xMin: 0, xMax: 1000, yMax: 880, yMin: -120 })
  })

  it('places a left-half box on the left with correct heights', () => {
    const rect = mapGlyphwikiBoxToFontUnits(
      { x1: 14, y1: 18, x2: 87, y2: 185 },
      1000,
      { top: 880, bottom: -120 }
    )
    expect(rect.xMin).toBeCloseTo(70)
    expect(rect.xMax).toBeCloseTo(435)
    expect(rect.yMax).toBeCloseTo(880 - 90)
    expect(rect.yMin).toBeCloseTo(880 - 925)
  })
})

describe('computePartBoxPlacement / transformPaths', () => {
  it('preserves a part position inside its GlyphWiki box without scaling', () => {
    const paths = [makeRectPath(100, 100, 300, 500)]
    const sourcePartBox = { xMin: 50, yMin: 0, xMax: 450, yMax: 800 }
    const targetPartBox = { xMin: 500, yMin: -120, xMax: 900, yMax: 680 }
    const transform = computePartBoxPlacement(sourcePartBox, targetPartBox)
    expect(transform.scaleX).toBe(1)
    expect(transform.scaleY).toBe(1)
    const moved = transformPaths(paths, transform)
    const bounds = getPathsBounds(moved)!
    // Size and the source offset from the part box top-left are preserved.
    expect(bounds.xMax - bounds.xMin).toBe(200)
    expect(bounds.yMax - bounds.yMin).toBe(400)
    expect(bounds.xMin - targetPartBox.xMin).toBe(
      paths[0]!.nodes[0]!.x - sourcePartBox.xMin
    )
    expect(targetPartBox.yMax - bounds.yMax).toBe(
      sourcePartBox.yMax - getPathsBounds(paths)!.yMax
    )
  })

  it('regenerates path and node ids', () => {
    const paths = [makeRectPath(0, 0, 10, 10)]
    const moved = transformPaths(paths, {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    })
    expect(moved[0]!.id).not.toBe(paths[0]!.id)
    expect(moved[0]!.nodes[0]!.id).not.toBe(paths[0]!.nodes[0]!.id)
  })
})

describe('extractPartPaths', () => {
  it('keeps paths inside the part box and drops the rest', () => {
    const leftPart = makeRectPath(50, 0, 400, 800)
    const rightPart = makeRectPath(600, 0, 950, 800)
    const selected = extractPartPaths([leftPart, rightPart], {
      xMin: 0,
      yMin: -120,
      xMax: 450,
      yMax: 880,
    })
    expect(selected).toEqual([leftPart])
  })

  it('keeps zero-area strokes whose center is inside the box', () => {
    const verticalStroke: PathData = {
      id: 'stroke',
      closed: false,
      nodes: [
        { id: 'a', x: 200, y: 0, kind: 'oncurve', segmentType: 'line' },
        { id: 'b', x: 200, y: 700, kind: 'oncurve', segmentType: 'line' },
      ],
    }
    const selected = extractPartPaths([verticalStroke], {
      xMin: 0,
      yMin: -120,
      xMax: 450,
      yMax: 880,
    })
    expect(selected).toHaveLength(1)
  })
})

describe('groupPathsByPartBoxes', () => {
  it('groups every stroke of a radical into one part', () => {
    // 火-like donor: body plus two dots, all within the left part box.
    const body = makeRectPath(100, 0, 350, 700)
    const dotLeft = makeRectPath(80, 500, 150, 600)
    const dotRight = makeRectPath(300, 500, 380, 600)
    const rightPart = makeRectPath(500, 0, 900, 700)
    const leftBox = { xMin: 0, yMin: -120, xMax: 450, yMax: 880 }
    const rightBox = { xMin: 450, yMin: -120, xMax: 1000, yMax: 880 }

    const { groups, remaining } = groupPathsByPartBoxes(
      [body, dotLeft, dotRight, rightPart],
      [leftBox, rightBox]
    )
    expect(groups[0]).toEqual([body, dotLeft, dotRight])
    expect(groups[1]).toEqual([rightPart])
    expect(remaining).toEqual([])
  })

  it('leaves unclaimed paths for fallback grouping', () => {
    const stray = makeRectPath(400, 0, 600, 800)
    const { groups, remaining } = groupPathsByPartBoxes(
      [stray],
      [{ xMin: 0, yMin: 0, xMax: 420, yMax: 800 }]
    )
    expect(groups[0]).toEqual([])
    expect(remaining).toEqual([stray])
  })
})

describe('scorePartFit', () => {
  it('prefers donors with closer part proportions', () => {
    const target = { x1: 14, y1: 18, x2: 87, y2: 185 }
    const closeDonor = { x1: 12, y1: 18, x2: 78, y2: 185 }
    const farDonor = { x1: 10, y1: 10, x2: 190, y2: 100 }
    expect(scorePartFit(closeDonor, target)).toBeLessThan(
      scorePartFit(farDonor, target)
    )
  })
})

describe('getFontVerticalBox', () => {
  it('uses line metrics when available', () => {
    expect(
      getFontVerticalBox({
        unitsPerEm: 1000,
        lineMetricsHorizontalLayout: { ascender: { value: 880 } },
      })
    ).toEqual({ top: 880, bottom: -120 })
  })

  it('falls back to 0.88em', () => {
    expect(getFontVerticalBox({ unitsPerEm: 1000 })).toEqual({
      top: 880,
      bottom: -120,
    })
  })
})
