import { describe, expect, it } from 'vitest'
import { getMasterKerningPairs } from '@/lib/kerning/resolveKerning'
import { resolveUfoKerningPairs } from '@/lib/github/sync/kumikoUfoSync'
import type { KumikoProjectRecord } from '@/lib/project/kumikoProjectTypes'
import type { KerningPair } from '@/domain'

const pair = (glyph: string, value: number): KerningPair => ({
  id: `p_${glyph}_${value}`,
  left: { kind: 'glyph', glyph },
  right: { kind: 'glyph', glyph },
  value,
})

describe('getMasterKerningPairs', () => {
  const fontData = {
    kerningPairs: [pair('a', -10)],
    kerningPairsByMaster: { Bold: [pair('a', -40)], Empty: [] },
  }

  it('returns the master entry when one exists', () => {
    expect(getMasterKerningPairs(fontData, 'Bold')[0].value).toBe(-40)
  })

  it('an empty master entry means no kerning, not the default set', () => {
    expect(getMasterKerningPairs(fontData, 'Empty')).toEqual([])
  })

  it('falls back to canonical pairs for the default master and null', () => {
    expect(getMasterKerningPairs(fontData, 'Light')[0].value).toBe(-10)
    expect(getMasterKerningPairs(fontData, null)[0].value).toBe(-10)
  })
})

describe('resolveUfoKerningPairs (sync)', () => {
  const project = {
    kerningPairs: [pair('a', -10)],
    kerningPairsByMaster: { Bold: [pair('a', -40)] },
    sources: {
      Light: { id: 'Light', name: 'Light', location: {}, ufoId: 'Light.ufo' },
      Bold: { id: 'Bold', name: 'Bold', location: {}, ufoId: 'Bold.ufo' },
    },
  } as unknown as KumikoProjectRecord

  it("writes each UFO its own master's pairs", () => {
    expect(resolveUfoKerningPairs(project, 'Bold.ufo')?.[0].value).toBe(-40)
  })

  it('writes the canonical pairs to the default UFO', () => {
    expect(resolveUfoKerningPairs(project, 'Light.ufo')?.[0].value).toBe(-10)
  })
})
