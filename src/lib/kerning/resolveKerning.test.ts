import { describe, expect, it } from 'vitest'
import {
  buildKerningGroupMaps,
  describeKerningSelector,
  findDuplicateMembershipGlyphs,
  findKerningPairIndex,
  resolveKerningPair,
  validateKerning,
} from 'src/lib/kerning/resolveKerning'
import type { KerningGroup, KerningPair } from 'src/store/types'

const groups: KerningGroup[] = [
  { id: 'g-left-A', side: 'left', name: 'A_left', glyphs: ['A', 'Agrave'] },
  { id: 'g-right-V', side: 'right', name: 'V_right', glyphs: ['V', 'W'] },
]

const fontData = (pairs: KerningPair[]) => ({
  kerningGroups: groups,
  kerningPairs: pairs,
})

describe('resolveKerningPair', () => {
  it('returns none when no pair matches', () => {
    const resolved = resolveKerningPair(fontData([]), 'A', 'V')
    expect(resolved.priority).toBe('none')
    expect(resolved.value).toBe(0)
  })

  it('resolves a glyph + glyph pair', () => {
    const resolved = resolveKerningPair(
      fontData([
        {
          left: { kind: 'glyph', glyph: 'A' },
          right: { kind: 'glyph', glyph: 'V' },
          value: -50,
        },
      ]),
      'A',
      'V'
    )
    expect(resolved.priority).toBe('glyph-glyph')
    expect(resolved.value).toBe(-50)
  })

  it('resolves a group + group pair via membership', () => {
    const resolved = resolveKerningPair(
      fontData([
        {
          left: { kind: 'class', classId: 'g-left-A' },
          right: { kind: 'class', classId: 'g-right-V' },
          value: -80,
        },
      ]),
      'Agrave',
      'W'
    )
    expect(resolved.priority).toBe('group-group')
    expect(resolved.value).toBe(-80)
    expect(resolved.leftGroup?.id).toBe('g-left-A')
    expect(resolved.rightGroup?.id).toBe('g-right-V')
  })

  it('matches class references by group name and @name', () => {
    for (const classId of ['A_left', '@A_left']) {
      const resolved = resolveKerningPair(
        fontData([
          {
            left: { kind: 'class', classId },
            right: { kind: 'glyph', glyph: 'V' },
            value: -30,
          },
        ]),
        'A',
        'V'
      )
      expect(resolved.priority).toBe('group-glyph')
      expect(resolved.value).toBe(-30)
    }
  })

  it('lets a glyph pair exception override the class pair', () => {
    const pairs: KerningPair[] = [
      {
        left: { kind: 'class', classId: 'g-left-A' },
        right: { kind: 'class', classId: 'g-right-V' },
        value: -80,
      },
      {
        left: { kind: 'glyph', glyph: 'A' },
        right: { kind: 'glyph', glyph: 'V' },
        value: -20,
      },
    ]
    const resolved = resolveKerningPair(fontData(pairs), 'A', 'V')
    expect(resolved.priority).toBe('glyph-glyph')
    expect(resolved.value).toBe(-20)
    expect(resolved.overriddenPair?.value).toBe(-80)
    expect(resolved.overriddenPriority).toBe('group-group')

    // Other members of the class still get the class value.
    const sibling = resolveKerningPair(fontData(pairs), 'Agrave', 'V')
    expect(sibling.priority).toBe('group-group')
    expect(sibling.value).toBe(-80)
  })

  it('prefers glyph + group over group + glyph and group + group', () => {
    const resolved = resolveKerningPair(
      fontData([
        {
          left: { kind: 'class', classId: 'g-left-A' },
          right: { kind: 'class', classId: 'g-right-V' },
          value: -80,
        },
        {
          left: { kind: 'class', classId: 'g-left-A' },
          right: { kind: 'glyph', glyph: 'V' },
          value: -60,
        },
        {
          left: { kind: 'glyph', glyph: 'A' },
          right: { kind: 'class', classId: 'g-right-V' },
          value: -40,
        },
      ]),
      'A',
      'V'
    )
    expect(resolved.priority).toBe('glyph-group')
    expect(resolved.value).toBe(-40)
  })

  it('skips the glyph pair with ignoreGlyphPair', () => {
    const resolved = resolveKerningPair(
      fontData([
        {
          left: { kind: 'class', classId: 'g-left-A' },
          right: { kind: 'class', classId: 'g-right-V' },
          value: -80,
        },
        {
          left: { kind: 'glyph', glyph: 'A' },
          right: { kind: 'glyph', glyph: 'V' },
          value: -20,
        },
      ]),
      'A',
      'V',
      { ignoreGlyphPair: true }
    )
    expect(resolved.priority).toBe('group-group')
    expect(resolved.value).toBe(-80)
  })
})

describe('findKerningPairIndex', () => {
  it('matches pairs whose class references use different conventions', () => {
    const maps = buildKerningGroupMaps(groups)
    const pairs: KerningPair[] = [
      {
        left: { kind: 'class', classId: '@A_left' },
        right: { kind: 'glyph', glyph: 'V' },
        value: -30,
      },
    ]
    const index = findKerningPairIndex(
      pairs,
      { kind: 'class', classId: 'g-left-A' },
      { kind: 'glyph', glyph: 'V' },
      maps
    )
    expect(index).toBe(0)
  })
})

describe('findDuplicateMembershipGlyphs', () => {
  it('reports glyphs in multiple same-side groups', () => {
    const duplicated: KerningGroup[] = [
      ...groups,
      { id: 'g-left-B', side: 'left', name: 'B_left', glyphs: ['A', 'B'] },
    ]
    const duplicates = findDuplicateMembershipGlyphs(duplicated, 'left')
    expect([...duplicates.keys()]).toEqual(['A'])
    expect(duplicates.get('A')?.map((group) => group.id)).toEqual([
      'g-left-A',
      'g-left-B',
    ])
    expect(findDuplicateMembershipGlyphs(duplicated, 'right').size).toBe(0)
  })
})

describe('validateKerning', () => {
  const glyphs = Object.fromEntries(
    ['A', 'Agrave', 'V', 'W'].map((id) => [id, { id, name: id }])
  ) as never

  it('returns no issues for consistent data', () => {
    expect(
      validateKerning({ glyphs, kerningGroups: groups, kerningPairs: [] })
    ).toEqual([])
  })

  it('reports empty groups, missing glyphs, duplicates, and bad references', () => {
    const issues = validateKerning({
      glyphs,
      kerningGroups: [
        ...groups,
        { id: 'g-empty', side: 'left', name: 'Empty', glyphs: [] },
        { id: 'g-dup', side: 'left', name: 'Dup', glyphs: ['A', 'Ghost'] },
      ],
      kerningPairs: [
        {
          left: { kind: 'class', classId: 'nonexistent' },
          right: { kind: 'glyph', glyph: 'Missing' },
          value: -10,
        },
      ],
    })
    const kinds = issues.map((issue) => issue.kind).sort()
    expect(kinds).toEqual([
      'duplicate-membership',
      'empty-group',
      'missing-glyph',
      'missing-glyph',
      'missing-group-reference',
    ])
  })
})

describe('describeKerningSelector', () => {
  it('formats glyphs and groups', () => {
    const maps = buildKerningGroupMaps(groups)
    expect(describeKerningSelector({ kind: 'glyph', glyph: 'A' }, maps)).toBe(
      'A'
    )
    expect(
      describeKerningSelector({ kind: 'class', classId: 'g-left-A' }, maps)
    ).toBe('@A_left')
  })
})
