import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  applyKumikoRemoteSnapshot,
  buildKumikoUfoExportManifest,
  buildKumikoProjectSyncReport,
  buildKumikoUfoExportState,
  loadKumikoUfoExportGlyphBatch,
  markKumikoGitHubCommitSynced,
  markKumikoUfoExportClean,
  prepareKumikoGitHubCommit,
} from 'src/lib/github/sync/kumikoUfoSync'
import { saveProjectDraft } from 'src/lib/project/projectRepository'
import {
  loadKumikoGlyphRecord,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
} from 'src/lib/project/kumikoProjectPersistence'
import type { FontData } from 'src/store'
import type { ProjectSyncReport } from 'src/lib/github/sync/types'

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)

vi.mock('src/lib/github/githubImport', () => ({
  fetchGitHubArchiveSnapshot: vi.fn(async () => ({
    archiveRoot: 'owner-repo',
    resolvedRef: 'main',
    zipballUrl: 'https://example.test/archive.zip',
    commitSha: 'remote-head',
    ufoEntries: [
      {
        relativePath: 'Kumiko.ufo/glyphs/A.glif',
        text: `<?xml version="1.0" encoding="UTF-8"?>
<glyph name="A" format="2">
  <advance width="700"/>
  <unicode hex="0041"/>
  <outline>
    <contour>
      <point x="0" y="0" type="move"/>
      <point x="100" y="0" type="line"/>
      <point x="100" y="100" type="line"/>
      <point x="0" y="100" type="line"/>
    </contour>
  </outline>
</glyph>`,
      },
      {
        relativePath: 'Kumiko.ufo/glyphs/contents.plist',
        text: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>A</key>
  <string>A.glif</string>
</dict>
</plist>`,
      },
    ],
  })),
}))

vi.mock('src/lib/github/sync/remoteTree', () => ({
  fetchRemoteTree: vi.fn(async () => ({
    commitSha: 'remote-head',
    truncated: false,
    blobShaByPath: new Map([
      ['Kumiko.ufo/glyphs/A.glif', 'old-sha'],
      ['Kumiko.ufo/glyphs/B.glif', 'old-b-sha'],
    ]),
  })),
}))

const sourceData = {
  ufo: {
    designspace: null,
    designspacePath: null,
    lastSync: {
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      commitSha: 'base',
      syncedAt: 1,
    },
    ufos: [
      {
        ufoId: 'Kumiko.ufo',
        relativePath: 'Kumiko.ufo',
        defaultLayerId: 'public.default',
        layers: [{ layerId: 'public.default', glyphDir: 'glyphs' }],
        contents: { A: 'A.glif' },
        glyphOrder: ['A'],
        metainfo: {},
        fontinfoExtra: {},
        libExtra: {},
        groupsExtra: {},
        kerningExtra: {},
      },
    ],
  },
} satisfies Parameters<typeof saveProjectDraft>[0]['projectSourceData']

const sourceDataWithDeletedB = {
  ufo: {
    ...sourceData.ufo,
    ufos: sourceData.ufo.ufos.map((ufo) => ({
      ...ufo,
      contents: { A: 'A.glif', B: 'B.glif' },
      glyphOrder: ['A', 'B'],
    })),
  },
} satisfies Parameters<typeof saveProjectDraft>[0]['projectSourceData']

const makeFontData = (width = 500): FontData => ({
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: ['0041'],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      sourceData: {
        ufo: {
          fileName: 'A.glif',
          sourceHash: 'old-hash',
          remoteBlobSha: 'old-sha',
        },
      },
      layers: {
        'public.default': {
          id: 'public.default',
          name: 'public.default',
          type: 'master',
          associatedMasterId: 'public.default',
          paths: [],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { width, lsb: 0, rsb: width },
          sourceData: {
            ufo: {
              ufoId: 'Kumiko.ufo',
              layerId: 'public.default',
              glyphDir: 'glyphs',
              fileName: 'A.glif',
              sourceHash: 'old-hash',
              remoteBlobSha: 'old-sha',
            },
          },
        },
      },
    },
  },
})

const saveCanonicalGitHubProject = async (projectId: string) => {
  await saveProjectDraft({
    id: projectId,
    title: 'Kumiko',
    lastModified: 2,
    createdAt: 1,
    updatedAt: 2,
    sourceName: 'Kumiko.ufo',
    sourceType: 'github',
    githubSource: {
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      defaultBranch: 'main',
      commitSha: 'base',
    },
    fontData: makeFontData(),
    projectMetadata: null,
    projectSourceData: sourceData,
    projectSourceFormat: 'ufo',
    projectRoundTripFormat: 'ufo',
    projectGlyphsPackage: null,
    projectExportDirty: true,
    projectSyncDirty: true,
    exportDirtyGlyphIds: ['A'],
    syncDirtyGlyphIds: ['A'],
  })
}

describe('Kumiko GitHub UFO sync', () => {
  it('prepares commit files from canonical records', async () => {
    await saveCanonicalGitHubProject('github-sync-prepare')

    const prepared = await prepareKumikoGitHubCommit({
      projectId: 'github-sync-prepare',
      projectTitle: 'Kumiko',
      activeUfoId: 'Kumiko.ufo',
    })

    expect(prepared.request.files.map((file) => file.path).sort()).toEqual([
      'Kumiko.ufo/glyphs/A.glif',
      'Kumiko.ufo/glyphs/contents.plist',
    ])
    expect(prepared.changedGlyphNames).toEqual(['A'])
  })

  it('builds sync reports from lightweight canonical metadata', async () => {
    await saveProjectDraft({
      id: 'github-sync-report',
      title: 'Kumiko',
      lastModified: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceName: 'Kumiko.ufo',
      sourceType: 'github',
      githubSource: {
        owner: 'owner',
        repo: 'repo',
        ref: 'main',
        defaultBranch: 'main',
        commitSha: 'base',
      },
      fontData: makeFontData(),
      projectMetadata: null,
      projectSourceData: sourceDataWithDeletedB,
      projectSourceFormat: 'ufo',
      projectRoundTripFormat: 'ufo',
      projectGlyphsPackage: null,
      syncDirtyGlyphIds: ['A'],
    })

    const report = await buildKumikoProjectSyncReport({
      projectId: 'github-sync-report',
      activeUfoId: 'Kumiko.ufo',
    })

    expect(report?.localChanges.map((entry) => entry.status).sort()).toEqual([
      'localDeleted',
      'localModified',
    ])
    expect(report?.localChanges.map((entry) => entry.glyphName).sort()).toEqual(
      ['A', 'B']
    )
  })

  it('applies remote GLIF updates to canonical glyph records', async () => {
    await saveCanonicalGitHubProject('github-sync-apply')
    const report: ProjectSyncReport = {
      target: { owner: 'owner', repo: 'repo', ref: 'main' },
      remoteHeadSha: 'remote-head',
      remoteTreeTruncated: false,
      entries: [
        {
          glyphName: 'A',
          fileName: 'A.glif',
          path: 'Kumiko.ufo/glyphs/A.glif',
          status: 'remoteModified',
          baselineSha: 'old-sha',
          remoteSha: 'new-sha',
        },
      ],
      conflicts: [],
      remoteChanges: [],
      localChanges: [],
      isUpToDate: false,
    }

    const result = await applyKumikoRemoteSnapshot({
      projectId: 'github-sync-apply',
      activeUfoId: 'Kumiko.ufo',
      report,
    })
    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('github-sync-apply', 'A')
    )

    expect(result).toEqual({ appliedCount: 1, remainingConflicts: 0 })
    expect(glyph?.layers['public.default']?.metrics.width).toBe(700)
    expect(glyph?.syncDirty).toBe(0)
    expect(glyph?.sourceData?.ufo?.remoteBlobSha).toBeTruthy()
  })

  it('marks committed glyphs and project UFO contents as synced', async () => {
    await saveCanonicalGitHubProject('github-sync-mark')

    await markKumikoGitHubCommitSynced(
      [
        {
          activeUfoId: 'Kumiko.ufo',
          glyphId: 'A',
          fileName: 'A.glif',
          sourceHash: 'next-hash',
          remoteBlobSha: 'next-sha',
        },
      ],
      {
        projectId: 'github-sync-mark',
        activeUfoId: 'Kumiko.ufo',
        headOwner: 'fork-owner',
        branchName: 'kumiko/a',
        commitSha: 'commit-sha',
      }
    )

    const [project, glyph] = await Promise.all([
      loadKumikoProjectRecord('github-sync-mark'),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('github-sync-mark', 'A')),
    ])

    expect(glyph?.syncDirty).toBe(0)
    expect(glyph?.sourceData?.ufo?.remoteBlobSha).toBe('next-sha')
    expect(project?.sourceData?.ufo?.ufos?.[0]?.contents).toEqual({
      A: 'A.glif',
    })
    expect(project?.sourceData?.ufo?.lastSync?.ref).toBe('kumiko/a')
  })

  it('builds UFO export state and marks canonical glyphs export-clean', async () => {
    await saveCanonicalGitHubProject('github-sync-export')

    const manifest = await buildKumikoUfoExportManifest('github-sync-export')
    const ufoManifest = manifest.ufos[0]
    expect(manifest.totalGlyphs).toBe(1)
    expect(ufoManifest?.glyphIds).toEqual(['A'])
    expect(ufoManifest?.contents).toEqual({ A: 'A.glif' })

    const batch = await loadKumikoUfoExportGlyphBatch({
      project: manifest.project,
      activeUfoId: ufoManifest?.metadata.ufoId ?? '',
      contents: ufoManifest?.contents ?? {},
      glyphIds: ufoManifest?.glyphIds ?? [],
    })
    expect(batch[0]?.glyphName).toBe('A')
    expect(batch[0]?.fileName).toBe('A.glif')

    const exportState = await buildKumikoUfoExportState('github-sync-export')
    const glyph = exportState.ufos[0]?.layers[0]?.glyphs[0]

    expect(exportState.ufos[0]?.metadata.relativePath).toBe('Kumiko.ufo')
    expect(glyph?.glyphName).toBe('A')
    expect(glyph?.fileName).toBe('A.glif')

    await markKumikoUfoExportClean('github-sync-export', [
      {
        activeUfoId: 'Kumiko.ufo',
        glyphId: 'A',
        fileName: 'A.glif',
        sourceHash: 'export-hash',
      },
    ])

    const storedGlyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('github-sync-export', 'A')
    )
    const project = await loadKumikoProjectRecord('github-sync-export')

    expect(storedGlyph?.exportDirty).toBe(0)
    expect(storedGlyph?.exportedDigest).toBe('export-hash')
    expect(project?.exportDirty).toBe(0)
  })
})
