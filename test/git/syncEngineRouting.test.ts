import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildKumikoProjectSyncReport = vi.fn(async () => null)
const buildGitSyncReport = vi.fn()
const loadGitSyncEnabled = vi.fn(() => false)
const loadKumikoProjectRecord = vi.fn()

vi.mock('src/lib/github/sync/kumikoUfoSync', () => ({
  buildKumikoProjectSyncReport: (input: unknown) =>
    buildKumikoProjectSyncReport(input),
  applyKumikoRemoteSnapshot: vi.fn(),
  resolveKumikoSyncTarget: () => ({
    owner: 'owner',
    repo: 'repo',
    ref: 'main',
    commitSha: null,
    syncedAt: 0,
  }),
}))
vi.mock('src/lib/git/gitSync', () => ({
  buildGitSyncReport: (input: unknown) => buildGitSyncReport(input),
}))
vi.mock('src/lib/preferences/appPreferences', () => ({
  loadGitSyncEnabled: () => loadGitSyncEnabled(),
}))
vi.mock('src/lib/project/kumikoProjectPersistence', () => ({
  loadKumikoProjectRecord: (id: unknown) => loadKumikoProjectRecord(id),
}))

const { buildProjectSyncReport } =
  await import('src/lib/github/sync/syncEngine')

beforeEach(() => {
  buildKumikoProjectSyncReport.mockClear()
  buildGitSyncReport.mockReset()
  loadGitSyncEnabled.mockReturnValue(false)
  loadKumikoProjectRecord.mockResolvedValue({ projectId: 'p1' })
})

describe('sync report transport routing', () => {
  it('uses the REST path while git sync is opt-out', async () => {
    await buildProjectSyncReport({ projectId: 'p1' })

    expect(buildKumikoProjectSyncReport).toHaveBeenCalledOnce()
    expect(buildGitSyncReport).not.toHaveBeenCalled()
  })

  it('uses git once the preference is on', async () => {
    loadGitSyncEnabled.mockReturnValue(true)
    buildGitSyncReport.mockResolvedValue({
      entries: [],
      conflicts: [],
      remoteChanges: [],
      localChanges: [],
      isUpToDate: true,
      remoteHeadSha: 'remote',
      mergeBaseSha: 'base',
      localHeadSha: 'local',
    })

    await buildProjectSyncReport({ projectId: 'p1' })

    expect(buildGitSyncReport).toHaveBeenCalledOnce()
    expect(buildKumikoProjectSyncReport).not.toHaveBeenCalled()
  })

  it('maps entity entries onto the shape the conflict UI renders', async () => {
    loadGitSyncEnabled.mockReturnValue(true)
    buildGitSyncReport.mockResolvedValue({
      entries: [
        {
          entity: { kind: 'glyph', name: 'A' },
          path: 'Light.ufo/glyphs/A.glif',
          status: 'conflict',
          baseText: 'base',
          localText: 'local',
          remoteText: 'remote',
        },
        {
          entity: { kind: 'font', part: 'info' },
          path: 'Light.ufo/fontinfo.plist',
          status: 'remoteModified',
          baseText: 'base',
          localText: 'base',
          remoteText: 'remote',
        },
      ],
      conflicts: [],
      remoteChanges: [],
      localChanges: [],
      isUpToDate: false,
      remoteHeadSha: 'remote-head',
      mergeBaseSha: 'base-sha',
      localHeadSha: 'local-head',
    })

    const report = await buildProjectSyncReport({ projectId: 'p1' })

    expect(report?.conflicts.map((entry) => entry.path)).toEqual([
      'Light.ufo/glyphs/A.glif',
    ])
    expect(report?.conflicts[0]?.glyphName).toBe('A')
    expect(report?.conflicts[0]?.kind).toBe('glyph')
    expect(report?.remoteChanges.map((entry) => entry.kind)).toEqual(['font'])
    expect(report?.remoteHeadSha).toBe('remote-head')
    expect(report?.isUpToDate).toBe(false)
  })

  it('reports a missing remote path as having no remote sha', async () => {
    loadGitSyncEnabled.mockReturnValue(true)
    buildGitSyncReport.mockResolvedValue({
      entries: [
        {
          entity: { kind: 'glyph', name: 'Gone' },
          path: 'Light.ufo/glyphs/Gone.glif',
          status: 'remoteDeleted',
          baseText: 'base',
          localText: 'base',
          remoteText: null,
        },
      ],
      conflicts: [],
      remoteChanges: [],
      localChanges: [],
      isUpToDate: false,
      remoteHeadSha: 'remote-head',
      mergeBaseSha: 'base-sha',
      localHeadSha: 'local-head',
    })

    const report = await buildProjectSyncReport({ projectId: 'p1' })

    expect(report?.entries[0]?.remoteSha).toBeNull()
    expect(report?.entries[0]?.baselineSha).toBe('base-sha')
  })
})
