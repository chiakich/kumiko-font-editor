import 'fake-indexeddb/auto'

import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  applyKumikoRemoteSnapshot,
  buildKumikoUfoExportManifest,
  buildKumikoProjectSyncReport,
  buildKumikoUfoExportState,
  loadKumikoUfoExportExtraGlyphBatch,
  loadKumikoUfoExportGlyphBatch,
  markKumikoGitHubCommitSynced,
  markKumikoUfoExportClean,
  prepareKumikoGitHubCommit,
} from 'src/lib/github/sync/kumikoUfoSync'
import { parseDesignspace } from 'src/lib/fontFormats/designspace'
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

const makeMultiSourceFontData = (): FontData => ({
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
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: ['0041'],
      activeLayerId: 'Light',
      layerOrder: ['Light', 'Bold'],
      layers: {
        Light: {
          id: 'Light',
          name: 'Light',
          type: 'master',
          associatedMasterId: 'Light',
          paths: [
            {
              id: 'light-path',
              closed: false,
              nodes: [
                {
                  id: 'light-node',
                  kind: 'oncurve',
                  segmentType: 'line',
                  x: 10,
                  y: 0,
                },
              ],
            },
          ],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { width: 500, lsb: 10, rsb: 490 },
        },
        Bold: {
          id: 'Bold',
          name: 'Bold',
          type: 'master',
          associatedMasterId: 'Bold',
          paths: [
            {
              id: 'bold-path',
              closed: false,
              nodes: [
                {
                  id: 'bold-node',
                  kind: 'oncurve',
                  segmentType: 'line',
                  x: 80,
                  y: 0,
                },
              ],
            },
          ],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { width: 700, lsb: 80, rsb: 620 },
        },
      },
    },
  },
})

const designspaceSourceData = {
  ufo: {
    designspace: {
      axes: [
        {
          name: 'Weight',
          tag: 'wght',
          minimum: 0,
          default: 0,
          maximum: 100,
        },
      ],
      sources: [
        { filename: 'Light.ufo', name: 'Light', location: { Weight: 0 } },
        { filename: 'Bold.ufo', name: 'Bold', location: { Weight: 100 } },
      ],
    },
    designspacePath: 'Family.designspace',
    lastSync: null,
    ufos: [
      {
        ufoId: 'Light.ufo',
        relativePath: 'Light.ufo',
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
      {
        ufoId: 'Bold.ufo',
        relativePath: 'Bold.ufo',
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

  it('exports canonical UFO background layers from glyph background content', async () => {
    const fontData = makeFontData()
    fontData.glyphs.A.layers!['public.default']!.background = {
      paths: [
        {
          id: 'bg-path',
          closed: false,
          nodes: [
            {
              id: 'bg-node',
              kind: 'oncurve',
              segmentType: 'line',
              x: 12,
              y: 34,
            },
          ],
        },
      ],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { width: 500, lsb: 12, rsb: 488 },
    }
    await saveProjectDraft({
      id: 'github-sync-background-export',
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
      fontData,
      projectMetadata: null,
      projectSourceData: {
        ufo: {
          ...sourceData.ufo,
          ufos: sourceData.ufo.ufos.map((ufo) => ({
            ...ufo,
            layers: [
              ...ufo.layers,
              { layerId: 'public.background', glyphDir: 'glyphs.background' },
            ],
          })),
        },
      },
      projectSourceFormat: 'ufo',
      projectRoundTripFormat: 'ufo',
      projectGlyphsPackage: null,
    })

    const manifest = await buildKumikoUfoExportManifest(
      'github-sync-background-export'
    )
    const ufoManifest = manifest.ufos[0]!
    const backgroundLayer = ufoManifest.metadata.layers.find(
      (layer) => layer.layerId === 'public.background'
    )!
    const backgroundBatch = await loadKumikoUfoExportGlyphBatch({
      project: manifest.project,
      activeUfoId: ufoManifest.metadata.ufoId,
      contents: ufoManifest.contents,
      glyphIds: ufoManifest.glyphIds,
      targetLayer: backgroundLayer,
    })

    expect(backgroundBatch).toHaveLength(1)
    expect(backgroundBatch[0]?.unicodes).toEqual([])
    expect(backgroundBatch[0]?.contours[0]?.points[0]).toMatchObject({
      x: 12,
      y: 34,
    })
  })

  it('builds generic canonical designspace manifests without UFO source metadata', async () => {
    await saveProjectDraft({
      id: 'generic-canonical-designspace-export',
      title: 'Family',
      lastModified: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceName: 'Family.glyphs',
      sourceType: 'local',
      githubSource: null,
      fontData: makeMultiSourceFontData(),
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'glyphs',
      projectRoundTripFormat: null,
      projectGlyphsPackage: null,
    })

    const manifest = await buildKumikoUfoExportManifest(
      'generic-canonical-designspace-export'
    )
    const boldManifest = manifest.ufos.find(
      (ufo) => ufo.metadata.ufoId === 'Bold'
    )
    const boldBatch = await loadKumikoUfoExportGlyphBatch({
      project: manifest.project,
      activeUfoId: boldManifest?.metadata.ufoId ?? '',
      contents: boldManifest?.contents ?? {},
      glyphIds: boldManifest?.glyphIds ?? [],
    })

    expect(manifest.designspace?.relativePath).toBe('Family.designspace')
    expect(manifest.designspace?.text).toContain('filename="Bold.ufo"')
    expect(boldManifest?.metadata.relativePath).toBe('Bold.ufo')
    expect(boldBatch[0]?.contours[0]?.points[0]?.x).toBe(80)
  })

  it('projects canonical brace layers and bracket rules to UFO designspace exports', async () => {
    const fontData = makeMultiSourceFontData()
    fontData.glyphs.A.layers = {
      ...fontData.glyphs.A.layers,
      brace: {
        id: 'brace',
        name: 'A Brace',
        type: 'brace',
        associatedMasterId: 'Light',
        braceLocation: { Weight: 50 },
        paths: [
          {
            id: 'brace-path',
            closed: false,
            nodes: [
              {
                id: 'brace-node',
                kind: 'oncurve',
                segmentType: 'line',
                x: 40,
                y: 0,
              },
            ],
          },
        ],
        componentRefs: [],
        anchors: [],
        guidelines: [],
        metrics: { width: 550, lsb: 40, rsb: 510 },
      },
      bracket: {
        id: 'bracket',
        name: 'A Bracket',
        type: 'bracket',
        associatedMasterId: 'Light',
        bracketAxisRules: { Weight: { min: 80, max: 100 } },
        paths: [
          {
            id: 'bracket-path',
            closed: false,
            nodes: [
              {
                id: 'bracket-node',
                kind: 'oncurve',
                segmentType: 'line',
                x: 90,
                y: 0,
              },
            ],
          },
        ],
        componentRefs: [],
        anchors: [],
        guidelines: [],
        metrics: { width: 560, lsb: 90, rsb: 470 },
      },
    }
    fontData.glyphs.A.layerOrder = ['Light', 'Bold', 'brace', 'bracket']

    await saveProjectDraft({
      id: 'canonical-special-layer-export',
      title: 'Family',
      lastModified: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceName: 'Family.glyphs',
      sourceType: 'local',
      githubSource: null,
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'glyphs',
      projectRoundTripFormat: null,
      projectGlyphsPackage: null,
    })

    const manifest = await buildKumikoUfoExportManifest(
      'canonical-special-layer-export'
    )
    const designspace = parseDesignspace(manifest.designspace?.text ?? '')
    const lightManifest = manifest.ufos.find(
      (ufo) => ufo.metadata.ufoId === 'Light'
    )!
    const braceManifest = manifest.ufos.find((ufo) =>
      ufo.metadata.relativePath.includes('brace.ufo')
    )!
    const extraBatch = await loadKumikoUfoExportExtraGlyphBatch({
      project: manifest.project,
      activeUfoId: lightManifest.metadata.ufoId,
      source: lightManifest.source,
      extraGlyphs: lightManifest.extraGlyphs ?? [],
      targetLayer: lightManifest.defaultLayer,
    })
    const braceBatch = await loadKumikoUfoExportGlyphBatch({
      project: manifest.project,
      activeUfoId: braceManifest.metadata.ufoId,
      source: braceManifest.source,
      contents: braceManifest.contents,
      glyphIds: braceManifest.glyphIds,
    })

    expect(manifest.totalGlyphs).toBe(5)
    expect(
      designspace.sources.some((source) =>
        source.filename.includes('brace.ufo')
      )
    ).toBe(true)
    expect(designspace.rules?.[0]).toMatchObject({
      name: 'A.bracket',
      conditions: { Weight: { minimum: 80, maximum: 100 } },
      substitutions: [{ name: 'A', with: 'A.bracket.bracket' }],
    })
    expect(lightManifest.extraGlyphs?.[0]).toMatchObject({
      glyphId: 'A',
      layerId: 'bracket',
      glyphName: 'A.bracket.bracket',
    })
    expect(extraBatch[0]?.glyphName).toBe('A.bracket.bracket')
    expect(extraBatch[0]?.unicodes).toEqual([])
    expect(extraBatch[0]?.contours[0]?.points[0]?.x).toBe(90)
    expect(braceBatch[0]?.glyphName).toBe('A')
    expect(braceBatch[0]?.unicodes).toEqual([])
    expect(braceBatch[0]?.advance.width).toBe(550)
    expect(braceBatch[0]?.contours[0]?.points[0]?.x).toBe(40)
  })

  it('maps source-backed designspace UFOs to their canonical source layers', async () => {
    await saveProjectDraft({
      id: 'source-backed-designspace-export',
      title: 'Family',
      lastModified: 2,
      createdAt: 1,
      updatedAt: 2,
      sourceName: 'Family.designspace',
      sourceType: 'local',
      githubSource: null,
      fontData: makeMultiSourceFontData(),
      projectMetadata: null,
      projectSourceData: designspaceSourceData,
      projectSourceFormat: 'designspace',
      projectRoundTripFormat: 'ufo',
      projectGlyphsPackage: null,
    })

    const manifest = await buildKumikoUfoExportManifest(
      'source-backed-designspace-export'
    )
    const boldManifest = manifest.ufos.find(
      (ufo) => ufo.metadata.ufoId === 'Bold.ufo'
    )
    const boldBatch = await loadKumikoUfoExportGlyphBatch({
      project: manifest.project,
      activeUfoId: boldManifest?.metadata.ufoId ?? '',
      contents: boldManifest?.contents ?? {},
      glyphIds: boldManifest?.glyphIds ?? [],
    })

    expect(manifest.designspace?.relativePath).toBe('Family.designspace')
    expect(boldBatch[0]?.contours[0]?.points[0]?.x).toBe(80)
    expect(boldBatch[0]?.advance.width).toBe(700)
  })
})
