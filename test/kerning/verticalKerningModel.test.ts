import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store'
import {
  buildUfoLibFromFontData,
  KUMIKO_VERTICAL_KERNING_LIB_KEY,
} from '@/lib/fontFormats/fontInfoSettings'
import {
  parseUfoKerning,
  parseVerticalKerningLib,
  serializeUfoKerning,
} from '@/lib/fontFormats/ufoKerning'
import { resolveUfoVerticalKerningPairs } from '@/lib/github/sync/kumikoUfoSync'
import {
  getMasterKerningPairs,
  hasKerningForOrientation,
} from '@/lib/kerning/resolveKerning'
import {
  dropMasterKerningEntries,
  filterAllKerningPairs,
  listAllKerningPairs,
  seedMasterKerningEntries,
} from '@/lib/kerning/kerningPairSets'
import type { KumikoProjectRecord } from '@/lib/project/kumikoProjectTypes'
import type { FontData, KerningPair } from '@/domain'

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

// The write path as sync uses it: serialize (mapping group refs to UFO keys),
// then hand the result to the lib builder.
const writeLib = (
  data: FontData,
  baseLib: Record<string, unknown> | null = {}
) =>
  buildUfoLibFromFontData(data, baseLib, {
    verticalKerning: serializeUfoKerning(data).verticalKerning,
  })

describe('vertical kerning UFO round-trip', () => {
  it('writes and reads back the lib key', () => {
    const data: FontData = {
      glyphs: {},
      verticalKerningPairs: [pair(-80)],
    }
    const raw = writeLib(data)[KUMIKO_VERTICAL_KERNING_LIB_KEY]
    expect(raw).toBeTruthy()
    expect(parseVerticalKerningLib(raw)).toEqual([pair(-80)])
  })

  it('rewrites class references to the UFO group keys groups.plist uses', () => {
    // An in-app group's id is a uuid; groups.plist stores it as public.kern1.*
    // and re-import rebuilds the group under that key, so the lib value has to
    // carry the mapped reference or the pair dangles.
    const data: FontData = {
      glyphs: {},
      kerningGroups: [
        { id: 'uuid-1234', side: 'left', name: 'round', glyphs: ['A'] },
      ],
      verticalKerningPairs: [
        {
          id: 'v1',
          left: { kind: 'class', classId: 'uuid-1234' },
          right: { kind: 'glyph', glyph: 'V' },
          value: -80,
        },
      ],
    }
    const serialized = serializeUfoKerning(data)
    const groupKey = Object.keys(serialized.groups)[0]
    expect(groupKey).toBe('public.kern1.round')
    expect(serialized.verticalKerning[0].left).toEqual({
      kind: 'class',
      classId: groupKey,
    })

    // Re-import: the group's id IS the UFO key, so the reference resolves.
    const reimported = parseUfoKerning(serialized.groups, serialized.kerning)
    const parsedPairs = parseVerticalKerningLib(
      writeLib(data)[KUMIKO_VERTICAL_KERNING_LIB_KEY]
    )
    expect(
      reimported.kerningGroups.some(
        (group) =>
          parsedPairs[0].left.kind === 'class' &&
          group.id === parsedPairs[0].left.classId
      )
    ).toBe(true)
  })

  it('clears the lib key when the last vertical pair is deleted', () => {
    const baseLib = { [KUMIKO_VERTICAL_KERNING_LIB_KEY]: [pair(-80)] }
    const emptied: FontData = { glyphs: {}, verticalKerningPairs: [] }
    // The key must be re-emitted as empty, not left stale: a conditional
    // write would let baseLib resurrect the deleted pairs on the next pull.
    expect(writeLib(emptied, baseLib)[KUMIKO_VERTICAL_KERNING_LIB_KEY]).toEqual(
      []
    )
  })

  it('omits the lib key for a project that never had vertical kerning', () => {
    const lib = writeLib({ glyphs: {} })
    expect(KUMIKO_VERTICAL_KERNING_LIB_KEY in lib).toBe(false)
  })

  it('ignores foreign lib values', () => {
    expect(parseVerticalKerningLib('nope')).toEqual([])
    expect(
      parseVerticalKerningLib([{ left: 1, right: 2, value: 'x' }])
    ).toEqual([])
  })

  it('never writes the canonical set into a non-default master UFO', () => {
    // A project saved before vertical kerning existed has horizontal
    // by-master entries but no vertical ones; the default master's vertical
    // pairs must not be cloned into every UFO.
    const legacy = {
      verticalKerningPairs: [pair(-10)],
      kerningPairsByMaster: { Bold: [pair(-40)] },
      sources: {
        Light: { id: 'Light', name: 'Light', location: {}, ufoId: 'L.ufo' },
        Bold: { id: 'Bold', name: 'Bold', location: {}, ufoId: 'B.ufo' },
      },
    } as unknown as KumikoProjectRecord
    expect(resolveUfoVerticalKerningPairs(legacy, 'B.ufo')).toEqual([])
    expect(resolveUfoVerticalKerningPairs(legacy, 'L.ufo')?.[0].value).toBe(-10)
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

describe('kerning pair set helpers', () => {
  const fourSets = (): FontData => ({
    glyphs: {},
    kerningPairs: [pair(-1)],
    kerningPairsByMaster: { Bold: [pair(-2)] },
    verticalKerningPairs: [pair(-3)],
    verticalKerningPairsByMaster: { Bold: [pair(-4)] },
  })

  it('lists every pair across both orientations and all masters', () => {
    expect(
      listAllKerningPairs(fourSets())
        .map((entry) => entry.value)
        .sort((a, b) => b - a)
    ).toEqual([-1, -2, -3, -4])
  })

  it('filters every set, so no dangling group reference survives', () => {
    const data = fourSets()
    filterAllKerningPairs(data, (entry) => entry.value !== -3)
    expect(listAllKerningPairs(data).map((entry) => entry.value)).not.toContain(
      -3
    )
    expect(listAllKerningPairs(data)).toHaveLength(3)
  })

  it('seeds and drops a master entry in both orientations', () => {
    const data: FontData = { glyphs: {}, kerningPairs: [pair(-1)] }
    seedMasterKerningEntries(data, 'Bold')
    expect(data.kerningPairsByMaster?.Bold).toEqual([])
    expect(data.verticalKerningPairsByMaster?.Bold).toEqual([])

    dropMasterKerningEntries(data, 'Bold')
    expect(data.kerningPairsByMaster?.Bold).toBeUndefined()
    expect(data.verticalKerningPairsByMaster?.Bold).toBeUndefined()
  })
})

describe('oriented kerning accessors', () => {
  const data: FontData = {
    glyphs: {},
    kerningPairs: [pair(-10)],
    verticalKerningPairs: [pair(-80)],
    verticalKerningPairsByMaster: { Bold: [pair(-40)] },
  }

  it('reads the requested orientation, per master', () => {
    expect(getMasterKerningPairs(data, null)[0].value).toBe(-10)
    expect(getMasterKerningPairs(data, null, 'vertical')[0].value).toBe(-80)
    expect(getMasterKerningPairs(data, 'Bold', 'vertical')[0].value).toBe(-40)
    // No vertical entry for Light: the canonical vertical set applies.
    expect(getMasterKerningPairs(data, 'Light', 'vertical')[0].value).toBe(-80)
  })

  it('reports whether an orientation carries any kerning', () => {
    expect(hasKerningForOrientation(data, 'vertical')).toBe(true)
    expect(hasKerningForOrientation({ glyphs: {} }, 'vertical')).toBe(false)
    expect(
      hasKerningForOrientation(
        { glyphs: {}, verticalKerningPairsByMaster: { Bold: [] } },
        'vertical'
      )
    ).toBe(false)
  })
})
