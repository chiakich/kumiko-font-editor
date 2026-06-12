import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from 'src/store'
import type { FontData, GlyphData } from 'src/store'

const makeGlyph = (id: string, unicode: string | null = null): GlyphData =>
  ({
    id,
    name: id,
    unicode,
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

describe('glyph actions', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('adds new unencoded glyphs to glyphOrder', () => {
    const fontData: FontData = {
      glyphOrder: ['A'],
      glyphs: {
        A: makeGlyph('A', '0041'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    const addedGlyphIds = useStore.getState().addGlyphs([
      {
        id: '.notdef',
        name: '.notdef',
        unicode: null,
      },
    ])

    expect(addedGlyphIds).toEqual(['.notdef'])
    expect(useStore.getState().fontData?.glyphOrder).toEqual(['A', '.notdef'])
  })
})
