import { describe, expect, it } from 'vitest'
import {
  buildSyncReport,
  computeGlyphSyncEntries,
} from 'src/lib/githubSync/computeSyncReport'
import type { RemoteTreeSnapshot } from 'src/lib/githubSync/types'
import type { UfoGlyphRecord } from 'src/lib/ufoTypes'

const GLYPH_DIR = 'Kumiko.ufo/glyphs'

const makeGlyph = (input: {
  glyphName: string
  fileName?: string
  dirty?: boolean
  remoteBlobSha?: string | null
}): UfoGlyphRecord => ({
  projectId: 'p1',
  ufoId: 'Kumiko.ufo',
  layerId: 'public.default',
  glyphName: input.glyphName,
  fileName: input.fileName ?? `${input.glyphName}.glif`,
  sourceHash: null,
  remoteBlobSha: input.remoteBlobSha ?? null,
  unicodes: [],
  advance: { width: 1000, height: null },
  anchors: [],
  guidelines: [],
  contours: [],
  components: [],
  note: null,
  image: null,
  lib: null,
  dirty: input.dirty ?? false,
  dirtyIndex: input.dirty ? 1 : 0,
  updatedAt: 0,
})

const makeRemote = (paths: Record<string, string>): RemoteTreeSnapshot => ({
  commitSha: 'deadbeef'.repeat(5),
  truncated: false,
  blobShaByPath: new Map(Object.entries(paths)),
})

const compute = (
  glyphs: UfoGlyphRecord[],
  remote: RemoteTreeSnapshot,
  locallyDeletedFiles: Record<string, string> = {}
) =>
  computeGlyphSyncEntries({
    glyphs,
    locallyDeletedFiles,
    glyphDirPath: GLYPH_DIR,
    remote,
  })

const statusOf = (
  entries: ReturnType<typeof compute>,
  glyphName: string | null
) => entries.find((entry) => entry.glyphName === glyphName)?.status

describe('computeGlyphSyncEntries', () => {
  it('reports unchanged when baseline matches remote and glyph is clean', () => {
    const entries = compute(
      [makeGlyph({ glyphName: 'A', remoteBlobSha: 'sha-a' })],
      makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-a' })
    )
    expect(statusOf(entries, 'A')).toBe('unchanged')
  })

  it('reports localModified when only the local side changed', () => {
    const entries = compute(
      [makeGlyph({ glyphName: 'A', dirty: true, remoteBlobSha: 'sha-a' })],
      makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-a' })
    )
    expect(statusOf(entries, 'A')).toBe('localModified')
  })

  it('reports remoteModified when only the remote side changed', () => {
    const entries = compute(
      [makeGlyph({ glyphName: 'A', remoteBlobSha: 'sha-a' })],
      makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-b' })
    )
    expect(statusOf(entries, 'A')).toBe('remoteModified')
  })

  it('reports conflict when both sides changed', () => {
    const entries = compute(
      [makeGlyph({ glyphName: 'A', dirty: true, remoteBlobSha: 'sha-a' })],
      makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-b' })
    )
    expect(statusOf(entries, 'A')).toBe('conflict')
  })

  it('reports remoteDeleted and conflict for deletions on the remote', () => {
    const entries = compute(
      [
        makeGlyph({ glyphName: 'A', remoteBlobSha: 'sha-a' }),
        makeGlyph({ glyphName: 'B', dirty: true, remoteBlobSha: 'sha-b' }),
      ],
      makeRemote({})
    )
    expect(statusOf(entries, 'A')).toBe('remoteDeleted')
    expect(statusOf(entries, 'B')).toBe('conflict')
  })

  it('treats unknown baselines as remote changes so a pull re-baselines', () => {
    const entries = compute(
      [makeGlyph({ glyphName: 'A', remoteBlobSha: null })],
      makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-a' })
    )
    expect(statusOf(entries, 'A')).toBe('remoteModified')
  })

  it('keeps purely local new glyphs as local changes', () => {
    const entries = compute(
      [makeGlyph({ glyphName: 'A', dirty: true, remoteBlobSha: null })],
      makeRemote({})
    )
    expect(statusOf(entries, 'A')).toBe('localModified')
  })

  it('reports remoteAdded for unknown remote glif files in the same layer', () => {
    const entries = compute(
      [],
      makeRemote({
        [`${GLYPH_DIR}/B.glif`]: 'sha-b',
        [`${GLYPH_DIR}/contents.plist`]: 'sha-c',
        ['Kumiko.ufo/glyphs.background/C.glif']: 'sha-d',
      })
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]!.status).toBe('remoteAdded')
    expect(entries[0]!.fileName).toBe('B.glif')
  })

  it('surfaces locally deleted glyphs instead of re-adding them', () => {
    const entries = compute(
      [],
      makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-a' }),
      { A: 'A.glif' }
    )
    expect(statusOf(entries, 'A')).toBe('localDeleted')
    expect(entries.filter((entry) => entry.status === 'remoteAdded')).toEqual(
      []
    )
  })
})

describe('buildSyncReport', () => {
  it('summarizes counts and up-to-date state', () => {
    const remote = makeRemote({
      [`${GLYPH_DIR}/A.glif`]: 'sha-a2',
      [`${GLYPH_DIR}/B.glif`]: 'sha-b2',
    })
    const entries = compute(
      [
        makeGlyph({ glyphName: 'A', remoteBlobSha: 'sha-a' }),
        makeGlyph({ glyphName: 'B', dirty: true, remoteBlobSha: 'sha-b' }),
      ],
      remote
    )
    const report = buildSyncReport({
      target: { owner: 'o', repo: 'r', ref: 'main' },
      remote,
      entries,
    })
    expect(report.remoteChanges).toHaveLength(1)
    expect(report.conflicts).toHaveLength(1)
    expect(report.isUpToDate).toBe(false)
  })

  it('is up to date when nothing differs', () => {
    const remote = makeRemote({ [`${GLYPH_DIR}/A.glif`]: 'sha-a' })
    const entries = compute(
      [makeGlyph({ glyphName: 'A', remoteBlobSha: 'sha-a' })],
      remote
    )
    const report = buildSyncReport({
      target: { owner: 'o', repo: 'r', ref: 'main' },
      remote,
      entries,
    })
    expect(report.isUpToDate).toBe(true)
  })
})
