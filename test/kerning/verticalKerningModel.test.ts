import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from 'src/store'
import { buildUfoLibFromFontData } from 'src/lib/fontFormats/fontInfoSettings'
import { KUMIKO_VERTICAL_KERNING_LIB_KEY } from 'src/lib/fontFormats/fontInfoSettings'
import { parseVerticalKerningLib } from 'src/lib/fontFormats/ufoKerning'
import { resolveUfoVerticalKerningPairs } from 'src/lib/github/sync/kumikoUfoSync'
import type { KumikoProjectRecord } from 'src/lib/project/kumikoProjectTypes'
import type { FontData, KerningPair } from 'src/store/types'

const pair = (value: number): KerningPair => ({
  id: `p_${value}`,
  left: { kind: 'glyph', glyph: 'A' },
  right: { kind: 'glyph', glyph: 'V' },
  value,
})

const fontData = (): FontData => ({
  glyphs: {},
  glyphOrder: [],
  kerningPairs: [pair(-10)],
})

describe('vertical kerning store actions', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('routes vertical upserts and deletes to verticalKerningPairs', () => {
    useStore.getState().loadProjectState('p', 'P', fontData())
    const left = { kind: 'glyph' as const, glyph: 'A' }
    const right = { kind: 'glyph' as const, glyph: 'V' }
    useStore.getState().upsertKerningPair(left, right, -80, 'vertical')

    const next = useStore.getState().fontData!
    expect(next.verticalKerningPairs).toHaveLength(1)
    expect(next.verticalKerningPairs?.[0].value).toBe(-80)
    // Horizontal set untouched.
    expect(next.kerningPairs).toHaveLength(1)
    expect(next.kerningPairs?.[0].value).toBe(-10)

    useStore.getState().deleteKerningPair(left, right, 'vertical')
    expect(useStore.getState().fontData?.verticalKerningPairs).toHaveLength(0)
    expect(useStore.getState().fontData?.kerningPairs).toHaveLength(1)
  })

  it('routes vertical edits to the active master entry', () => {
    useStore.getState().loadProjectState('p', 'P', {
      ...fontData(),
      sources: {
        Light: { id: 'Light', name: 'Light', location: {} },
        Bold: { id: 'Bold', name: 'Bold', location: {} },
      },
      verticalKerningPairsByMaster: { Bold: [] },
    })
    useStore.setState({ activeMasterId: 'Bold' })
    useStore
      .getState()
      .upsertKerningPair(
        { kind: 'glyph', glyph: 'A' },
        { kind: 'glyph', glyph: 'V' },
        -40,
        'vertical'
      )
    const next = useStore.getState().fontData!
    expect(next.verticalKerningPairsByMaster?.Bold).toHaveLength(1)
    expect(next.verticalKerningPairs ?? []).toHaveLength(0)
  })
})

describe('vertical kerning UFO round-trip', () => {
  it('writes and reads back the lib key', () => {
    const data: FontData = {
      glyphs: {},
      verticalKerningPairs: [pair(-80)],
    }
    const lib = buildUfoLibFromFontData(data)
    const raw = lib[KUMIKO_VERTICAL_KERNING_LIB_KEY]
    expect(raw).toBeTruthy()
    const parsed = parseVerticalKerningLib(raw)
    expect(parsed).toEqual([pair(-80)])
  })

  it('ignores foreign lib values', () => {
    expect(parseVerticalKerningLib('nope')).toEqual([])
    expect(
      parseVerticalKerningLib([{ left: 1, right: 2, value: 'x' }])
    ).toEqual([])
  })

  it("resolves each UFO's own master pairs for sync", () => {
    const project = {
      verticalKerningPairs: [pair(-10)],
      verticalKerningPairsByMaster: { Bold: [pair(-40)] },
      sources: {
        Light: { id: 'Light', name: 'Light', location: {}, ufoId: 'L.ufo' },
        Bold: { id: 'Bold', name: 'Bold', location: {}, ufoId: 'B.ufo' },
      },
    } as unknown as KumikoProjectRecord
    expect(resolveUfoVerticalKerningPairs(project, 'B.ufo')?.[0].value).toBe(
      -40
    )
    expect(resolveUfoVerticalKerningPairs(project, 'L.ufo')?.[0].value).toBe(
      -10
    )
  })
})
