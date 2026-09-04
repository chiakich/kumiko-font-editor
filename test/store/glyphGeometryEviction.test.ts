import { afterEach, describe, expect, it } from 'vitest'
import { isGlyphGeometryLoaded } from '@/lib/glyph/glyphGeometryState'
import { useStore } from '@/store'
import type { FontData, GlyphData } from '@/store'

const makeGlyph = (id: string): GlyphData =>
  ({
    id,
    name: id,
    unicodes: [],
    activeLayerId: 'public.default',
    layerOrder: ['public.default'],
    layers: {
      'public.default': {
        id: 'public.default',
        name: 'public.default',
        paths: [
          {
            id: `${id}-path`,
            closed: false,
            nodes: [
              {
                id: `${id}-node`,
                kind: 'oncurve',
                segmentType: 'line',
                x: 0,
                y: 0,
              },
            ],
          },
        ],
        componentRefs: [],
        anchors: [],
        guidelines: [],
        metrics: { width: 1000, lsb: 0, rsb: 0 },
      },
    },
  }) as unknown as GlyphData

const makeMetadataGlyph = (id: string): GlyphData => ({
  id,
  name: id,
  unicodes: [],
  layerOrder: ['public.default'],
})

const loadFont = () => {
  const fontData: FontData = {
    glyphOrder: ['A', 'B', 'C', 'D'],
    glyphs: {
      A: makeGlyph('A'),
      B: makeGlyph('B'),
      C: makeGlyph('C'),
      D: makeMetadataGlyph('D'),
    },
  }
  useStore.getState().loadProjectState('project-a', 'Project A', fontData, null)
}

describe('glyph geometry eviction', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('evicts least recently used geometry while keeping the selected glyph and new batch', () => {
    loadFont()

    useStore.getState().hydrateGlyphGeometry([makeGlyph('D')], {
      maxLoadedGlyphs: 2,
    })

    const glyphs = useStore.getState().fontData?.glyphs
    expect(glyphs?.A && isGlyphGeometryLoaded(glyphs.A)).toBe(true)
    expect(glyphs?.B && isGlyphGeometryLoaded(glyphs.B)).toBe(false)
    expect(glyphs?.C && isGlyphGeometryLoaded(glyphs.C)).toBe(false)
    expect(glyphs?.D && isGlyphGeometryLoaded(glyphs.D)).toBe(true)
    expect(glyphs?.B?.layerOrder).toEqual(['public.default'])
  })

  it('does not evict dirty glyph geometry even when protected glyphs exceed the limit', () => {
    loadFont()
    useStore.setState({
      dirtyGlyphIds: ['B'],
      localDirtyGlyphIds: ['B'],
    })

    useStore.getState().hydrateGlyphGeometry([makeGlyph('D')], {
      maxLoadedGlyphs: 2,
    })

    const glyphs = useStore.getState().fontData?.glyphs
    expect(glyphs?.A && isGlyphGeometryLoaded(glyphs.A)).toBe(true)
    expect(glyphs?.B && isGlyphGeometryLoaded(glyphs.B)).toBe(true)
    expect(glyphs?.C && isGlyphGeometryLoaded(glyphs.C)).toBe(false)
    expect(glyphs?.D && isGlyphGeometryLoaded(glyphs.D)).toBe(true)
  })
})
