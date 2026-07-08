import { describe, expect, it } from 'vitest'
import {
  parseUfoKerning,
  serializeUfoKerning,
} from 'src/lib/fontFormats/ufoKerning'

const UFO_GROUPS = {
  'public.kern1.A': ['A', 'Agrave'],
  'public.kern2.V': ['V', 'W'],
  'com.example.other': ['A', 'B'],
}

const UFO_KERNING = {
  'public.kern1.A': { 'public.kern2.V': -80, T: -40 },
  A: { V: -20 },
}

describe('parseUfoKerning', () => {
  it('maps kern1/kern2 groups to sided kerning groups', () => {
    const parsed = parseUfoKerning(UFO_GROUPS, {})
    expect(parsed.kerningGroups).toEqual([
      {
        id: 'public.kern1.A',
        side: 'left',
        name: 'A',
        glyphs: ['A', 'Agrave'],
      },
      { id: 'public.kern2.V', side: 'right', name: 'V', glyphs: ['V', 'W'] },
    ])
    expect(parsed.warnings).toEqual([])
  })

  it('parses glyph pairs, class pairs, and exceptions', () => {
    const parsed = parseUfoKerning(UFO_GROUPS, UFO_KERNING)
    expect(parsed.kerningPairs).toEqual([
      {
        id: 'ufo:public.kern1.A:public.kern2.V',
        left: { kind: 'class', classId: 'public.kern1.A' },
        right: { kind: 'class', classId: 'public.kern2.V' },
        value: -80,
      },
      {
        id: 'ufo:public.kern1.A:T',
        left: { kind: 'class', classId: 'public.kern1.A' },
        right: { kind: 'glyph', glyph: 'T' },
        value: -40,
      },
      {
        id: 'ufo:A:V',
        left: { kind: 'glyph', glyph: 'A' },
        right: { kind: 'glyph', glyph: 'V' },
        value: -20,
      },
    ])
  })

  it('warns on missing group references and bad values', () => {
    const parsed = parseUfoKerning(
      {},
      {
        'public.kern1.Missing': { V: -10 },
        A: { V: 'oops' },
      }
    )
    expect(parsed.warnings.some((w) => w.includes('missing group'))).toBe(true)
    expect(parsed.warnings.some((w) => w.includes('non-numeric'))).toBe(true)
    expect(parsed.kerningPairs).toHaveLength(1)
  })

  it('warns when a group is used on the wrong side', () => {
    const parsed = parseUfoKerning(UFO_GROUPS, {
      'public.kern2.V': { A: -10 },
    })
    expect(parsed.warnings.some((w) => w.includes('on the left side'))).toBe(
      true
    )
  })
})

describe('serializeUfoKerning', () => {
  it('round-trips parsed kerning and preserves non-kerning groups', () => {
    const parsed = parseUfoKerning(UFO_GROUPS, UFO_KERNING)
    const serialized = serializeUfoKerning(
      {
        kerningGroups: parsed.kerningGroups,
        kerningPairs: parsed.kerningPairs,
      },
      { groups: UFO_GROUPS }
    )
    expect(serialized.groups).toEqual(UFO_GROUPS)
    expect(serialized.kerning).toEqual(UFO_KERNING)
    expect(serialized.warnings).toEqual([])
  })

  it('derives UFO keys for editor-created groups', () => {
    const serialized = serializeUfoKerning({
      kerningGroups: [
        { id: 'some-uuid', side: 'left', name: '@A_left', glyphs: ['A'] },
        { id: 'other-uuid', side: 'right', name: 'V_right', glyphs: ['V'] },
      ],
      kerningPairs: [
        {
          left: { kind: 'class', classId: 'some-uuid' },
          right: { kind: 'class', classId: 'other-uuid' },
          value: -70,
        },
      ],
    })
    expect(serialized.groups).toEqual({
      'public.kern1.A_left': ['A'],
      'public.kern2.V_right': ['V'],
    })
    expect(serialized.kerning).toEqual({
      'public.kern1.A_left': { 'public.kern2.V_right': -70 },
    })
  })

  it('drops stale kern groups from extras and warns on unresolved references', () => {
    const serialized = serializeUfoKerning(
      {
        kerningGroups: [],
        kerningPairs: [
          {
            left: { kind: 'class', classId: 'deleted-group' },
            right: { kind: 'glyph', glyph: 'V' },
            value: -10,
          },
        ],
      },
      { groups: UFO_GROUPS }
    )
    expect(serialized.groups).toEqual({ 'com.example.other': ['A', 'B'] })
    expect(serialized.kerning).toEqual({})
    expect(serialized.warnings).toHaveLength(1)
  })
})
