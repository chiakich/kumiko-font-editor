import { describe, expect, it } from 'vitest'
import {
  buildEntitySyncEntries,
  entityGroupStatus,
  groupEntriesByEntity,
  resolveEntityStatus,
  summarizeEntitySync,
  type EntitySyncInput,
} from 'src/lib/git/entitySync'
import type { EntityId } from 'src/lib/fontFormats/formatAdapter/types'

const glyph = (name: string): EntityId => ({ kind: 'glyph', name })

const status = (
  base: string | null,
  local: string | null,
  remote: string | null
) => resolveEntityStatus({ baseOid: base, localOid: local, remoteOid: remote })

describe('three-way entity status', () => {
  it('reports unchanged when nobody moved', () => {
    expect(status('a', 'a', 'a')).toBe('unchanged')
  })

  it('separates local from remote movement', () => {
    expect(status('a', 'b', 'a')).toBe('localModified')
    expect(status('a', 'a', 'b')).toBe('remoteModified')
  })

  it('distinguishes a remote addition from a remote modification', () => {
    expect(status(null, null, 'new')).toBe('remoteAdded')
    expect(status('old', 'old', 'new')).toBe('remoteModified')
  })

  it('reports deletions on the side that deleted', () => {
    expect(status('a', null, 'a')).toBe('localDeleted')
    expect(status('a', 'a', null)).toBe('remoteDeleted')
  })

  it('conflicts only when both sides moved differently', () => {
    expect(status('a', 'b', 'c')).toBe('conflict')
    expect(status('a', null, 'c')).toBe('conflict')
    expect(status('a', 'b', null)).toBe('conflict')
  })

  it('treats identical edits on both sides as convergence, not conflict', () => {
    expect(status('a', 'b', 'b')).toBe('unchanged')
    expect(status('a', null, null)).toBe('unchanged')
  })

  it('handles a path that never existed anywhere', () => {
    expect(status(null, null, null)).toBe('unchanged')
  })

  it('treats a purely local addition as a local change', () => {
    expect(status(null, 'new', null)).toBe('localModified')
  })
})

describe('entity sync summary', () => {
  const inputs: EntitySyncInput[] = [
    {
      entity: glyph('A'),
      path: 'Light.ufo/glyphs/A.glif',
      baseOid: 'a',
      localOid: 'a2',
      remoteOid: 'a',
    },
    {
      entity: glyph('B'),
      path: 'Light.ufo/glyphs/B.glif',
      baseOid: 'b',
      localOid: 'b',
      remoteOid: 'b2',
    },
    {
      entity: glyph('C'),
      path: 'Light.ufo/glyphs/C.glif',
      baseOid: 'c',
      localOid: 'c2',
      remoteOid: 'c3',
    },
    {
      entity: { kind: 'font', part: 'info' },
      path: 'Light.ufo/fontinfo.plist',
      baseOid: 'i',
      localOid: 'i',
      remoteOid: 'i',
    },
  ]

  it('buckets entries by which side moved', () => {
    const report = summarizeEntitySync(buildEntitySyncEntries(inputs))

    expect(report.localChanges.map((entry) => entry.path)).toEqual([
      'Light.ufo/glyphs/A.glif',
    ])
    expect(report.remoteChanges.map((entry) => entry.path)).toEqual([
      'Light.ufo/glyphs/B.glif',
    ])
    expect(report.conflicts.map((entry) => entry.path)).toEqual([
      'Light.ufo/glyphs/C.glif',
    ])
    expect(report.isUpToDate).toBe(false)
  })

  it('is up to date when only local changes exist', () => {
    const report = summarizeEntitySync(
      buildEntitySyncEntries([inputs[0]!, inputs[3]!])
    )
    expect(report.isUpToDate).toBe(true)
  })
})

describe('grouping paths by entity', () => {
  it('collects every master of one glyph into a single group', () => {
    const entries = buildEntitySyncEntries([
      {
        entity: glyph('A'),
        path: 'Light.ufo/glyphs/A.glif',
        baseOid: 'l',
        localOid: 'l',
        remoteOid: 'l',
      },
      {
        entity: glyph('A'),
        path: 'Bold.ufo/glyphs/A.glif',
        baseOid: 'b',
        localOid: 'b2',
        remoteOid: 'b',
      },
    ])

    const groups = groupEntriesByEntity(entries)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.key).toBe('glyph:A')
    expect(groups[0]?.entries).toHaveLength(2)
    // One master moved locally, so the glyph as a whole is locally modified.
    expect(entityGroupStatus(groups[0]!.entries)).toBe('localModified')
  })

  it('escalates a group to conflict when any master conflicts', () => {
    const entries = buildEntitySyncEntries([
      {
        entity: glyph('A'),
        path: 'Light.ufo/glyphs/A.glif',
        baseOid: 'l',
        localOid: 'l2',
        remoteOid: 'l',
      },
      {
        entity: glyph('A'),
        path: 'Bold.ufo/glyphs/A.glif',
        baseOid: 'b',
        localOid: 'b2',
        remoteOid: 'b3',
      },
    ])

    expect(entityGroupStatus(groupEntriesByEntity(entries)[0]!.entries)).toBe(
      'conflict'
    )
  })

  it('reports unchanged for a glyph settled in every master', () => {
    const entries = buildEntitySyncEntries([
      {
        entity: glyph('A'),
        path: 'Light.ufo/glyphs/A.glif',
        baseOid: 'l',
        localOid: 'l',
        remoteOid: 'l',
      },
      {
        entity: glyph('A'),
        path: 'Bold.ufo/glyphs/A.glif',
        baseOid: 'b',
        localOid: 'b',
        remoteOid: 'b',
      },
    ])

    expect(entityGroupStatus(groupEntriesByEntity(entries)[0]!.entries)).toBe(
      'unchanged'
    )
  })
})
