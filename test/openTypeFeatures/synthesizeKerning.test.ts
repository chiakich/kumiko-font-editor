import { describe, expect, it } from 'vitest'
import { synthesizeKerningFea } from '@/lib/openTypeFeatures/synthesizeKerning'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'
import type { KerningGroup, KerningPair } from '@/store/types'

const groups: KerningGroup[] = [
  {
    id: 'grp-1',
    side: 'left',
    name: 'public.kern1.quote',
    glyphs: ['quoteleft', 'quoteright'],
  },
  {
    id: 'grp-2',
    side: 'right',
    name: 'public.kern2.hanzi',
    glyphs: ['uni6C38', 'uni5B57'],
  },
]

const available = new Set([
  'quoteleft',
  'quoteright',
  'uni6C38',
  'uni5B57',
  'A',
  'V',
])

const pair = (
  left: KerningPair['left'],
  right: KerningPair['right'],
  value: number
): KerningPair => ({ left, right, value })

describe('synthesizeKerningFea', () => {
  it('emits classes and pairs in FEA form', () => {
    const result = synthesizeKerningFea({
      kerningGroups: groups,
      kerningPairs: [
        pair({ kind: 'glyph', glyph: 'A' }, { kind: 'glyph', glyph: 'V' }, -52),
        pair(
          { kind: 'class', classId: 'grp-1' },
          { kind: 'class', classId: 'public.kern2.hanzi' },
          -30.4
        ),
      ],
      availableGlyphIds: available,
    })

    expect(result?.pairCount).toBe(2)
    expect(result?.text).toContain(
      '@public.kern1.quote = [quoteleft quoteright];'
    )
    expect(result?.text).toContain('pos A V -52;')
    expect(result?.text).toContain(
      'pos @public.kern1.quote @public.kern2.hanzi -30;'
    )
    expect(result?.text).toContain('feature kern {')
  })

  it('drops zero values, missing glyphs and empty classes', () => {
    const result = synthesizeKerningFea({
      kerningGroups: [
        { id: 'g', side: 'left', name: 'ghost', glyphs: ['missing'] },
      ],
      kerningPairs: [
        pair({ kind: 'glyph', glyph: 'A' }, { kind: 'glyph', glyph: 'V' }, 0),
        pair(
          { kind: 'glyph', glyph: 'A' },
          { kind: 'glyph', glyph: 'gone' },
          -10
        ),
        pair(
          { kind: 'class', classId: 'g' },
          { kind: 'glyph', glyph: 'A' },
          -10
        ),
      ],
      availableGlyphIds: available,
    })
    expect(result).toBeNull()
  })

  it('skips pairs the IR kern feature already carries', () => {
    const state = {
      features: [
        {
          id: 'f-kern',
          tag: 'kern',
          isActive: true,
          entries: [
            { id: 'e', script: 'DFLT', language: 'dflt', lookupIds: ['l'] },
          ],
        },
      ],
      lookups: [
        {
          id: 'l',
          rules: [
            {
              id: 'r',
              kind: 'pairPositioning',
              left: { kind: 'glyph', glyph: 'A' },
              right: { kind: 'glyph', glyph: 'V' },
              firstValue: { xAdvance: -52 },
            },
          ],
        },
      ],
      glyphClasses: [],
    } as unknown as OpenTypeFeaturesState

    const result = synthesizeKerningFea({
      kerningGroups: [],
      kerningPairs: [
        pair({ kind: 'glyph', glyph: 'A' }, { kind: 'glyph', glyph: 'V' }, -52),
        pair(
          { kind: 'glyph', glyph: 'quoteleft' },
          { kind: 'glyph', glyph: 'A' },
          -20
        ),
      ],
      availableGlyphIds: available,
      state,
    })

    expect(result?.pairCount).toBe(1)
    expect(result?.skippedPairCount).toBe(1)
    expect(result?.text).not.toContain('pos A V')
  })
})
