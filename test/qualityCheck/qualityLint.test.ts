import { describe, expect, it } from 'vitest'
import { buildQualityReport } from 'src/features/common/qualityCheck/qualityLint'
import type { FontData, GlyphData, PathData } from 'src/store/types'

const makePath = (
  id: string,
  points: Array<[number, number]>,
  closed = true
): PathData => ({
  id,
  closed,
  nodes: points.map(([x, y], index) => ({
    id: `${id}_${index}`,
    x,
    y,
    type: 'corner',
  })),
})

const makeGlyph = (
  id: string,
  overrides: Partial<GlyphData> = {}
): GlyphData => ({
  id,
  name: id,
  paths: [],
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 1000 },
  ...overrides,
})

const makeFontData = (glyphs: GlyphData[]): FontData => ({
  glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
  glyphOrder: glyphs.map((glyph) => glyph.id),
  unitsPerEm: 1000,
})

const issueKeys = (fontData: FontData, dirtyGlyphIds: string[] = []) =>
  buildQualityReport({
    fontData,
    scope: dirtyGlyphIds.length ? 'changed' : 'font',
    dirtyGlyphIds,
    deletedGlyphIds: [],
  }).issues.map((issue) => issue.id)

describe('quality lint report', () => {
  it('reports blocking path and coordinate issues', () => {
    const fontData = makeFontData([
      makeGlyph('broken', {
        paths: [
          makePath(
            'open',
            [
              [0, 0],
              [100, Number.NaN],
            ],
            false
          ),
        ],
      }),
    ])

    const report = buildQualityReport({
      fontData,
      scope: 'font',
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
    })

    expect(report.summary.blockingCount).toBe(2)
    expect(report.summary.hasBlockingIssues).toBe(true)
    expect(report.issues.map((issue) => issue.id)).toContain(
      'broken:invalid-coordinates'
    )
    expect(report.issues.map((issue) => issue.id)).toContain('broken:open-path')
  })

  it('reports component missing sources and cycles', () => {
    const a = makeGlyph('a', {
      componentRefs: [
        {
          id: 'a_b',
          glyphId: 'b',
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      ],
    })
    const b = makeGlyph('b', {
      componentRefs: [
        {
          id: 'b_a',
          glyphId: 'a',
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        {
          id: 'b_missing',
          glyphId: 'missing',
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      ],
    })

    const keys = issueKeys(makeFontData([a, b]))

    expect(keys).toContain('a:component-cycle')
    expect(keys).toContain('b:component-cycle')
    expect(keys).toContain('b:missing-components')
  })

  it('reports nested contours with the same direction', () => {
    const fontData = makeFontData([
      makeGlyph('counter', {
        paths: [
          makePath('outer', [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ]),
          makePath('inner', [
            [20, 20],
            [80, 20],
            [80, 80],
            [20, 80],
          ]),
        ],
      }),
    ])

    expect(issueKeys(fontData)).toContain('counter:nested-contour-direction')
  })

  it('uses the changed scope and deleted count in summaries', () => {
    const fontData = makeFontData([
      makeGlyph('dirty', { paths: [makePath('open', [[0, 0]], false)] }),
      makeGlyph('untouched', {
        paths: [makePath('untouched_open', [[0, 0]], false)],
      }),
    ])
    const report = buildQualityReport({
      fontData,
      scope: 'changed',
      dirtyGlyphIds: ['dirty'],
      deletedGlyphIds: ['deleted.glif'],
    })

    expect(report.summary.glyphCount).toBe(1)
    expect(report.summary.deletedCount).toBe(1)
    expect(report.issues.map((issue) => issue.glyphId)).toEqual(['dirty'])
  })
})
