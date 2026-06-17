import { afterEach, describe, expect, it } from 'vitest'
import { useStore, getGlyphLayer } from 'src/store'
import type { FontData, GlyphData, PathData } from 'src/store/types'

const makeGlyph = (paths: PathData[]): GlyphData => ({
  id: 'glyph-a',
  name: 'glyph-a',
  paths,
  components: [],
  componentRefs: [],
  metrics: { width: 1000, lsb: 0, rsb: 0 },
})

const loadGlyph = (paths: PathData[]) => {
  const fontData: FontData = {
    glyphs: {
      'glyph-a': makeGlyph(paths),
    },
  }
  useStore.getState().loadProjectState('project-a', 'Project A', fontData)
}

describe('path actions', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('deletes attached curve handles when selected on-curve nodes are deleted', () => {
    loadGlyph([
      {
        id: 'path-a',
        closed: true,
        nodes: [
          { id: 'n1', x: 0, y: 0, kind: 'oncurve', segmentType: 'line' },
          { id: 'h1', x: 25, y: 100, kind: 'offcurve' },
          { id: 'h2', x: 75, y: 100, kind: 'offcurve' },
          { id: 'n2', x: 100, y: 0, kind: 'oncurve', segmentType: 'line' },
          { id: 'h3', x: 100, y: -50, kind: 'offcurve' },
          { id: 'h4', x: 0, y: -50, kind: 'offcurve' },
        ],
      },
    ])

    useStore
      .getState()
      .deleteSelectedNodes('glyph-a', ['path-a:n1', 'path-a:n2'])

    expect(
      getGlyphLayer(useStore.getState().fontData?.glyphs['glyph-a'], null)
        ?.paths
    ).toEqual([])
  })

  it('keeps unrelated handles when deleting one node from a closed curve path', () => {
    loadGlyph([
      {
        id: 'path-a',
        closed: true,
        nodes: [
          { id: 'n1', x: 0, y: 0, kind: 'oncurve', segmentType: 'line' },
          { id: 'h1', x: 25, y: 100, kind: 'offcurve' },
          { id: 'h2', x: 75, y: 100, kind: 'offcurve' },
          { id: 'n2', x: 100, y: 0, kind: 'oncurve', segmentType: 'line' },
          { id: 'h3', x: 100, y: -50, kind: 'offcurve' },
          { id: 'h4', x: 0, y: -50, kind: 'offcurve' },
          { id: 'n3', x: -50, y: 0, kind: 'oncurve', segmentType: 'line' },
          { id: 'h5', x: -75, y: 50, kind: 'offcurve' },
          { id: 'h6', x: -25, y: 50, kind: 'offcurve' },
        ],
      },
    ])

    useStore.getState().deleteSelectedNodes('glyph-a', ['path-a:n2'])

    expect(
      getGlyphLayer(
        useStore.getState().fontData?.glyphs['glyph-a'],
        null
      )?.paths[0]?.nodes.map((node) => node.id)
    ).toEqual(['n1', 'n3', 'h5', 'h6'])
  })
})
