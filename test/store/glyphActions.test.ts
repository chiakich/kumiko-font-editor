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

const makeMetadataGlyph = (id: string): GlyphData => ({
  id,
  name: id,
  unicodes: [],
  layerOrder: ['public.default'],
})

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

  it('renames a glyph and rewrites dependent references', () => {
    const fontData: FontData = {
      glyphOrder: ['A', 'B', 'C'],
      glyphs: {
        A: makeGlyph('A', '0041'),
        B: {
          ...makeGlyph('B', '0042'),
          leftMetricsKey: 'A',
          layers: {
            'public.default': {
              id: 'public.default',
              name: 'public.default',
              type: 'master',
              associatedMasterId: 'public.default',
              paths: [],
              componentRefs: [
                {
                  id: 'component-1',
                  glyphId: 'A',
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              ],
              anchors: [],
              guidelines: [],
              metrics: { width: 1000, lsb: 0, rsb: 0 },
            },
          },
        },
        C: makeGlyph('C', '0043'),
      },
      kerningGroups: [{ id: 'left-A', side: 'left', name: 'A', glyphs: ['A'] }],
      kerningPairs: [
        {
          left: { kind: 'glyph', glyph: 'A' },
          right: { kind: 'glyph', glyph: 'B' },
          value: -50,
        },
      ],
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    const renamed = useStore.getState().renameGlyph('A', 'A.alt')
    const state = useStore.getState()

    expect(renamed).toBe(true)
    expect(state.fontData?.glyphs.A).toBeUndefined()
    expect(state.fontData?.glyphs['A.alt']?.id).toBe('A.alt')
    expect(state.fontData?.glyphOrder).toEqual(['A.alt', 'B', 'C'])
    expect(
      state.fontData?.glyphs.B.layers?.['public.default'].componentRefs[0]
        .glyphId
    ).toBe('A.alt')
    expect(state.fontData?.glyphs.B.leftMetricsKey).toBe('A.alt')
    expect(state.fontData?.kerningGroups?.[0].glyphs).toEqual(['A.alt'])
    expect(state.fontData?.kerningPairs?.[0].left).toEqual({
      kind: 'glyph',
      glyph: 'A.alt',
    })
    expect(state.deletedGlyphIds).toContain('A')
    expect(state.dirtyGlyphIds).toContain('A.alt')
  })

  it('refuses to rename onto an existing glyph', () => {
    const fontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: makeGlyph('A', '0041'),
        B: makeGlyph('B', '0042'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    expect(useStore.getState().renameGlyph('A', 'B')).toBe(false)
    expect(useStore.getState().fontData?.glyphOrder).toEqual(['A', 'B'])
    expect(useStore.getState().deletedGlyphIds).toEqual([])
    expect(useStore.getState().dirtyGlyphIds).toEqual([])
  })

  it('does not synthesize empty layers for metadata-only glyph geometry edits', () => {
    const fontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: makeMetadataGlyph('A'),
        B: makeGlyph('B', '0042'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    expect(useStore.getState().fontData?.glyphs.A.layers).toBeUndefined()

    useStore.getState().updateGlyphMetrics('A', { width: 700 })
    useStore.getState().updateNodePosition('A', 'path-1', 'node-1', {
      x: 10,
      y: 20,
    })
    expect(useStore.getState().addComponentRef('A', 'B')).toBe(false)
    useStore.getState().createBackupLayer('A')
    useStore.getState().createPath('A', {
      closed: false,
      nodes: [],
    })

    expect(useStore.getState().fontData?.glyphs.A.layers).toBeUndefined()
    expect(useStore.getState().dirtyGlyphIds).toEqual([])
    expect(useStore.getState().persistenceQueue.glyphIds).toEqual([])
  })

  it('uses unitsPerEm for new glyph width when existing glyphs are metadata-only', () => {
    const fontData: FontData = {
      glyphOrder: ['A'],
      unitsPerEm: 2048,
      glyphs: {
        A: makeMetadataGlyph('A'),
      },
    }
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    expect(
      useStore.getState().addGlyphs([
        {
          id: 'B',
          name: 'B',
          unicode: '0042',
        },
      ])
    ).toEqual(['B'])

    expect(
      useStore.getState().fontData?.glyphs.B.layers?.['public.default']?.metrics
        .width
    ).toBe(2048)
  })
})
