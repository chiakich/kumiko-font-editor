import { describe, expect, it } from 'vitest'
import { interpolateKerningPairsAtLocation } from 'src/lib/kerning/interpolateKerning'
import type { FontData, KerningPair } from 'src/store/types'

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

  it('falls back to canonical pairs without per-master kerning', () => {
    const fontData = baseFontData()
    delete fontData.kerningPairsByMaster
    const pairs = interpolateKerningPairsAtLocation(fontData, { Weight: 50 })
    expect(pairs).toEqual(fontData.kerningPairs)
  })
})
