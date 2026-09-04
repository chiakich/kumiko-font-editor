import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildGitSyncReport = vi.fn()
const loadKumikoProjectRecord = vi.fn()

vi.mock('@/lib/github/sync/kumikoUfoSync', () => ({
  resolveKumikoSyncTarget: () => ({
    owner: 'owner',
    repo: 'repo',
    ref: 'main',
    commitSha: null,
    syncedAt: 0,
  }),
}))
// The report runs in a worker; the routing under test is which transport the
// engine picks, so the worker client stands in for it.
vi.mock('@/lib/git/gitSyncWorkerClient', () => ({
  buildGitSyncReportInWorker: (target: unknown) =>
    buildGitSyncReport({ target }),
}))
vi.mock('@/lib/git/gitSync', () => ({
  buildGitSyncReport: (input: unknown) => buildGitSyncReport(input),
  applyGitRemoteChanges: vi.fn(),
}))
vi.mock('@/lib/project/kumikoProjectPersistence', () => ({
  loadKumikoProjectRecord: (id: unknown) => loadKumikoProjectRecord(id),
}))

const { buildProjectSyncReport } = await import('@/lib/github/sync/syncEngine')

beforeEach(() => {
  buildGitSyncReport.mockReset()
  loadKumikoProjectRecord.mockResolvedValue({ projectId: 'p1' })
})

describe('sync report transport routing', () => {
  it('uses git by default', async () => {
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
  })

  it('maps entity entries onto the shape the conflict UI renders', async () => {
    buildGitSyncReport.mockResolvedValue({
      entries: [
        {
          entity: { kind: 'glyph', name: 'A' },
          path: 'Light.ufo/glyphs/A.glif',
          status: 'conflict',
          baseOid: 'base',
          localOid: 'local',
          remoteOid: 'remote',
        },
        {
          entity: { kind: 'font', part: 'info' },
          path: 'Light.ufo/fontinfo.plist',
          status: 'remoteModified',
          baseOid: 'base',
          localOid: 'base',
          remoteOid: 'remote',
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
    buildGitSyncReport.mockResolvedValue({
      entries: [
        {
          entity: { kind: 'glyph', name: 'Gone' },
          path: 'Light.ufo/glyphs/Gone.glif',
          status: 'remoteDeleted',
          baseOid: 'base',
          localOid: 'base',
          remoteOid: null,
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
