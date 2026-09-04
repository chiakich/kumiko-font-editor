import { describe, expect, it } from 'vitest'
import { interpolateKerningPairsAtLocation } from '@/lib/kerning/interpolateKerning'
import type { FontData, KerningPair } from '@/domain'

const pair = (left: string, right: string, value: number): KerningPair => ({
  id: `p_${left}_${right}_${value}`,
  left: { kind: 'glyph', glyph: left },
  right: { kind: 'glyph', glyph: right },
  value,
})

const baseFontData = (): Pick<
  FontData,
  'axes' | 'sources' | 'kerningPairs' | 'kerningPairsByMaster'
> => ({
  axes: {
    axes: [
      {
        name: 'Weight',
        label: 'Weight',
        tag: 'wght',
        minValue: 0,
        defaultValue: 0,
        maxValue: 100,
      },
    ],
    mappings: [],
  },
  sources: {
    Light: { id: 'Light', name: 'Light', location: { Weight: 0 } },
    Bold: { id: 'Bold', name: 'Bold', location: { Weight: 100 } },
  },
  kerningPairs: [pair('A', 'V', -20)],
  kerningPairsByMaster: { Bold: [pair('A', 'V', -60)] },
})

const findPair = (pairs: KerningPair[], left: string, right: string) =>
  pairs.find(
    (candidate) =>
      candidate.left.kind === 'glyph' &&
      candidate.left.glyph === left &&
      candidate.right.kind === 'glyph' &&
      candidate.right.glyph === right
  )

describe('interpolateKerningPairsAtLocation', () => {
  it('returns the midpoint value between two masters', () => {
    const pairs = interpolateKerningPairsAtLocation(baseFontData(), {
      Weight: 50,
    })
    expect(findPair(pairs, 'A', 'V')?.value).toBeCloseTo(-40)
  })

  it("returns a master's own pairs at its exact location", () => {
    const fontData = baseFontData()
    expect(
      findPair(
        interpolateKerningPairsAtLocation(fontData, { Weight: 0 }),
        'A',
        'V'
      )?.value
    ).toBe(-20)
    expect(
      findPair(
        interpolateKerningPairsAtLocation(fontData, { Weight: 100 }),
        'A',
        'V'
      )?.value
    ).toBe(-60)
  })

  it('treats a pair missing from a master as 0 there', () => {
    const fontData = baseFontData()
    fontData.kerningPairsByMaster = {
      Bold: [pair('A', 'V', -60), pair('T', 'o', -80)],
    }
    const pairs = interpolateKerningPairsAtLocation(fontData, { Weight: 50 })
    expect(findPair(pairs, 'T', 'o')?.value).toBeCloseTo(-40)
  })

  it('treats a pair missing from a master entry but present in canonical as 0 there', () => {
    const fontData = baseFontData()
    fontData.kerningPairs = [pair('A', 'V', -20), pair('W', 'a', -30)]
    // Bold's own entry lacks W/a, so Bold contributes 0 for it.
    const pairs = interpolateKerningPairsAtLocation(fontData, { Weight: 50 })
    expect(findPair(pairs, 'W', 'a')?.value).toBeCloseTo(-15)
  })

  it('matches class pairs across masters through group reference aliases', () => {
    const fontData = baseFontData()
    fontData.kerningGroups = [
      { id: 'public.kern1.A', name: 'A', side: 'left', glyphs: ['A'] },
    ] as never
    // Canonical references the group by id, the master by '@name'.
    fontData.kerningPairs = [
      {
        id: 'p1',
        left: { kind: 'class', classId: 'public.kern1.A' },
        right: { kind: 'glyph', glyph: 'V' },
        value: -20,
      },
    ]
    fontData.kerningPairsByMaster = {
      Bold: [
        {
          id: 'p2',
          left: { kind: 'class', classId: '@A' },
          right: { kind: 'glyph', glyph: 'V' },
          value: -60,
        },
      ],
    }
    const pairs = interpolateKerningPairsAtLocation(fontData, { Weight: 50 })
    expect(pairs).toHaveLength(1)
    expect(pairs[0].value).toBeCloseTo(-40)
  })

  it('falls back to canonical pairs without per-master kerning', () => {
    const fontData = baseFontData()
    delete fontData.kerningPairsByMaster
    const pairs = interpolateKerningPairsAtLocation(fontData, { Weight: 50 })
    expect(findPair(pairs, 'A', 'V')?.value).toBe(-20)
    expect(pairs).toHaveLength(1)
  })
})
