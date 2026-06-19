import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from 'src/store'
import type { FontData, GlyphData } from 'src/store'

const makeGlyph = (id: string, unicode: string | null = null): GlyphData =>
  ({
    id,
    name: id,
    unicodes: unicode ? [unicode] : [],
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

  it('removes a deleted glyph from glyphOrder', () => {
    const fontData: FontData = {
      glyphOrder: ['A', 'B', 'C'],
      glyphs: {
        A: makeGlyph('A', '0041'),
        B: makeGlyph('B', '0042'),
        C: makeGlyph('C', '0043'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    useStore.getState().deleteGlyph('B')

    expect(useStore.getState().fontData?.glyphOrder).toEqual(['A', 'C'])
    expect(useStore.getState().fontData?.glyphs.B).toBeUndefined()
  })

  it('moves a deleted glyph from dirty to deleted tracking', () => {
    const fontData: FontData = {
      glyphOrder: ['A'],
      glyphs: { A: makeGlyph('A', '0041') },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    useStore.setState({ dirtyGlyphIds: ['A'], localDirtyGlyphIds: ['A'] })

    useStore.getState().deleteGlyph('A')

    expect(useStore.getState().dirtyGlyphIds).not.toContain('A')
    expect(useStore.getState().deletedGlyphIds).toContain('A')
  })

  it('re-adding a deleted glyph clears it from deleted tracking', () => {
    const fontData: FontData = {
      glyphOrder: ['A'],
      glyphs: { A: makeGlyph('A', '0041') },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    useStore.getState().deleteGlyph('A')

    useStore.getState().addGlyphs([{ id: 'A', name: 'A', unicode: '0041' }])

    expect(useStore.getState().deletedGlyphIds).not.toContain('A')
    expect(useStore.getState().dirtyGlyphIds).toContain('A')
  })
})
