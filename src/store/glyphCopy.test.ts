import { describe, expect, it } from 'vitest'
import {
  createGlyphCopies,
  createGlyphCopyId,
  insertGlyphIdsAfter,
} from 'src/store/glyphCopy'
import type { GlyphData } from 'src/store/types'

const makeGlyph = (
  id: string,
  componentGlyphId?: string,
  patch: Partial<GlyphData> = {}
): GlyphData => ({
  id,
  name: id,
  activeLayerId: 'public.default',
  componentGlyphIds: componentGlyphId ? [componentGlyphId] : [],
  layerOrder: ['public.default'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      associatedMasterId: 'public.default',
      paths: [],
      componentRefs: componentGlyphId
        ? [
            {
              glyphId: componentGlyphId,
              id: 'component-1',
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              x: 0,
              y: 0,
            },
          ]
        : [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 500, width: 500 },
    },
  },
  unicodes: ['0041'],
  production: `${id}.prod`,
  ...patch,
})

describe('glyph copy helpers', () => {
  it('creates a non-conflicting copy id', () => {
    expect(createGlyphCopyId('A', new Set(['A', 'A.copy']))).toBe('A.copy2')
  })

  it('creates glyph copies without unicode or production conflicts', () => {
    const [copy] = createGlyphCopies([makeGlyph('A')], ['A'])

    expect(copy.id).toBe('A.copy')
    expect(copy.name).toBe('A.copy')
    expect(copy.unicodes).toEqual([])
    expect(copy.production).toBeNull()
  })

  it('retargets components between glyphs copied together', () => {
    const [baseCopy, compositeCopy] = createGlyphCopies(
      [makeGlyph('base'), makeGlyph('composite', 'base')],
      ['base', 'composite']
    )

    expect(baseCopy.id).toBe('base.copy')
    expect(compositeCopy.id).toBe('composite.copy')
    expect(compositeCopy.componentGlyphIds).toEqual(['base.copy'])
    expect(
      compositeCopy.layers?.['public.default']?.componentRefs[0]?.glyphId
    ).toBe('base.copy')
  })

  it('inserts pasted glyph ids after the requested glyph id', () => {
    expect(insertGlyphIdsAfter(['A', 'B', 'C'], ['B.copy'], 'B')).toEqual([
      'A',
      'B',
      'B.copy',
      'C',
    ])
  })

  it('appends pasted glyph ids when the insertion anchor is missing', () => {
    expect(insertGlyphIdsAfter(['A', 'B'], ['C.copy'], 'Z')).toEqual([
      'A',
      'B',
      'C.copy',
    ])
  })
})
