import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import {
  saveProjectDraft,
  loadProjectDraft,
  loadProjectDraftMetadata,
  loadProjectGlyphGeometryClosure,
  loadProjectGlyphGeometry,
} from 'src/lib/project/projectRepository'
import {
  findKumikoGlyphRecordsByUnicode,
  getKumikoProjectDirtyState,
  listExportDirtyKumikoGlyphIds,
  listExportDirtyKumikoGlyphRecords,
  listKumikoGlyphMetadataForProject,
  listSyncDirtyKumikoGlyphIds,
  loadKumikoGlyphRecord,
  loadKumikoProjectRecord,
  markKumikoProjectExportClean,
  makeKumikoGlyphKey,
  patchKumikoGlyphMetadata,
} from 'src/lib/project/kumikoProjectPersistence'
import { saveDraftSnapshot } from 'src/lib/project/draftSave'
import { openDatabase } from 'src/lib/project/persistence'
import type { FontData } from 'src/store'

const fontData: FontData = {
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: ['0041'],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
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
          metrics: { width: 500, lsb: 0, rsb: 500 },
        },
      },
    },
  },
}

describe('projectRepository canonical storage', () => {
  it('stores drafts as Kumiko project and glyph records', async () => {
    await saveProjectDraft({
      id: 'project-1',
      title: 'Repository Test',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'Test.glyphs',
      sourceType: 'local',
      fontData,
      projectMetadata: { familyName: 'Repository Test' },
      projectSourceData: {
        glyphs: {
          formatVersion: 3,
          packageName: null,
          repoPath: null,
          documentFields: { familyName: 'Repository Test' },
        },
      },
      projectSourceFormat: 'glyphs',
      exportDirtyGlyphIds: ['A'],
    })

    const projectRecord = await loadKumikoProjectRecord('project-1')
    const dirtyGlyphs = await listExportDirtyKumikoGlyphRecords('project-1')
    const unicodeGlyphs = await findKumikoGlyphRecordsByUnicode(
      'project-1',
      'U+41'
    )
    const shortUnicodeGlyphs = await findKumikoGlyphRecordsByUnicode(
      'project-1',
      '41'
    )
    const loaded = await loadProjectDraft('project-1')

    expect(projectRecord?.sourceData?.glyphs?.formatVersion).toBe(3)
    expect(projectRecord?.exportedDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(projectRecord?.syncedDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(dirtyGlyphs.map((glyph) => glyph.glyphId)).toEqual(['A'])
    await expect(listExportDirtyKumikoGlyphIds('project-1')).resolves.toEqual([
      'A',
    ])
    await expect(listSyncDirtyKumikoGlyphIds('project-1')).resolves.toEqual([])
    await expect(
      getKumikoProjectDirtyState('project-1')
    ).resolves.toMatchObject({
      projectExportDirty: false,
      projectSyncDirty: false,
      exportDirtyGlyphIds: ['A'],
      syncDirtyGlyphIds: [],
      exportDirty: true,
      syncDirty: false,
    })
    expect(unicodeGlyphs.map((glyph) => glyph.glyphId)).toEqual(['A'])
    expect(shortUnicodeGlyphs.map((glyph) => glyph.glyphId)).toEqual(['A'])
    expect(dirtyGlyphs[0]?.exportedDigest).toBeNull()
    expect(loaded?.fontData?.glyphs.A.unicodes).toEqual(['0041'])
    expect(loaded?.projectMetadata).toEqual({ familyName: 'Repository Test' })
  })

  it('creates only canonical IndexedDB stores', async () => {
    const database = await openDatabase()
    expect(Array.from(database.objectStoreNames).sort()).toEqual([
      'kumiko_glyphs',
      'kumiko_projects',
      'kumiko_ui_state',
    ])
  })

  it('autosaves only dirty and deleted glyph records', async () => {
    const twoGlyphFontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        ...fontData.glyphs,
        B: {
          ...fontData.glyphs.A,
          id: 'B',
          name: 'B',
          unicodes: ['0042'],
        },
      },
    }
    await saveProjectDraft({
      id: 'project-incremental',
      title: 'Incremental',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'Incremental.ufo',
      sourceType: 'local',
      fontData: twoGlyphFontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const nextFontData: FontData = {
      ...twoGlyphFontData,
      glyphOrder: ['A'],
      glyphs: {
        A: {
          ...twoGlyphFontData.glyphs.A,
          layers: {
            'public.default': {
              ...twoGlyphFontData.glyphs.A.layers!['public.default']!,
              metrics: { width: 640, lsb: 0, rsb: 640 },
            },
          },
        },
      },
    }

    await saveDraftSnapshot({
      projectId: 'project-incremental',
      projectTitle: 'Incremental',
      fontData: nextFontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: ['B'],
      glyphEditTimes: { A: 30 },
      selectedLayerId: 'public.default',
    })

    const [project, glyphA, glyphB] = await Promise.all([
      loadKumikoProjectRecord('project-incremental'),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-incremental', 'A')),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-incremental', 'B')),
    ])

    expect(project?.glyphOrder).toEqual(['A'])
    expect(glyphA?.layers['public.default']?.metrics.width).toBe(640)
    expect(glyphA?.exportDirty).toBe(1)
    expect(glyphB).toBeUndefined()
  })

  it('persists glyph rename as old-key delete plus new-key add', async () => {
    const originalFontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: fontData.glyphs.A,
        B: {
          ...fontData.glyphs.A,
          id: 'B',
          name: 'B',
          unicodes: ['0042'],
          layers: {
            'public.default': {
              ...fontData.glyphs.A.layers!['public.default']!,
              componentRefs: [
                {
                  id: 'component-1',
                  glyphId: 'A',
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              ],
            },
          },
        },
      },
    }
    await saveProjectDraft({
      id: 'project-rename',
      title: 'Rename',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'Rename.ufo',
      sourceType: 'local',
      fontData: originalFontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const renamedFontData: FontData = {
      ...originalFontData,
      glyphOrder: ['A.alt', 'B'],
      glyphs: {
        'A.alt': {
          ...originalFontData.glyphs.A,
          id: 'A.alt',
          name: 'A.alt',
        },
        B: {
          ...originalFontData.glyphs.B,
          layers: {
            'public.default': {
              ...originalFontData.glyphs.B.layers!['public.default']!,
              componentRefs: [
                {
                  id: 'component-1',
                  glyphId: 'A.alt',
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              ],
            },
          },
        },
      },
    }

    await saveDraftSnapshot({
      projectId: 'project-rename',
      projectTitle: 'Rename',
      fontData: renamedFontData,
      dirtyGlyphIds: ['A.alt', 'B'],
      deletedGlyphIds: ['A'],
      glyphEditTimes: { 'A.alt': 40, B: 40 },
      selectedLayerId: 'public.default',
    })

    const [project, oldGlyph, newGlyph, dependentGlyph] = await Promise.all([
      loadKumikoProjectRecord('project-rename'),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-rename', 'A')),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-rename', 'A.alt')),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-rename', 'B')),
    ])

    expect(project?.glyphOrder).toEqual(['A.alt', 'B'])
    expect(oldGlyph).toBeUndefined()
    expect(newGlyph?.glyphId).toBe('A.alt')
    expect(dependentGlyph?.componentGlyphIds).toEqual(['A.alt'])
    expect(dependentGlyph?.componentRefKeys).toEqual(['project-rename\0A.alt'])
  })

  it('keeps project clean when autosaving only glyph geometry changes', async () => {
    await saveProjectDraft({
      id: 'project-glyph-only',
      title: 'Glyph Only',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'GlyphOnly.ufo',
      sourceType: 'local',
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const nextFontData: FontData = {
      ...fontData,
      glyphs: {
        A: {
          ...fontData.glyphs.A,
          layers: {
            'public.default': {
              ...fontData.glyphs.A.layers!['public.default']!,
              metrics: { width: 620, lsb: 0, rsb: 620 },
            },
          },
        },
      },
    }

    await saveDraftSnapshot({
      projectId: 'project-glyph-only',
      projectTitle: 'Glyph Only',
      fontData: nextFontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: [],
      glyphEditTimes: { A: 40 },
      selectedLayerId: 'public.default',
    })

    const [project, glyphA] = await Promise.all([
      loadKumikoProjectRecord('project-glyph-only'),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-glyph-only', 'A')),
    ])

    expect(project?.exportDirty).toBe(0)
    expect(project?.syncDirty).toBe(0)
    expect(glyphA?.exportDirty).toBe(1)
    expect(glyphA?.syncDirty).toBe(1)
  })

  it('autosaves project-only metadata changes without dirty glyphs', async () => {
    await saveProjectDraft({
      id: 'project-only-autosave',
      title: 'Project Only Autosave',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'ProjectOnly.ufo',
      sourceType: 'local',
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const nextFontData: FontData = {
      ...fontData,
      fontInfo: {
        familyName: 'Renamed Family',
        customData: {},
      },
    }
    await saveDraftSnapshot({
      projectId: 'project-only-autosave',
      projectTitle: 'Project Only Autosave',
      fontData: nextFontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
      projectQueued: true,
      glyphEditTimes: {},
      selectedLayerId: 'public.default',
    })

    const project = await loadKumikoProjectRecord('project-only-autosave')
    const dirtyState = await getKumikoProjectDirtyState('project-only-autosave')
    expect(project?.fontInfo?.familyName).toBe('Renamed Family')
    expect(project?.exportDirty).toBe(1)
    expect(project?.syncDirty).toBe(1)
    expect(dirtyState).toMatchObject({
      projectExportDirty: true,
      projectSyncDirty: true,
      exportDirtyGlyphIds: [],
      syncDirtyGlyphIds: [],
      exportDirty: true,
      syncDirty: true,
    })
  })

  it('marks project and glyph export baselines clean after whole-font export', async () => {
    await saveProjectDraft({
      id: 'project-export-clean',
      title: 'Export Clean',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      fontData: {
        glyphOrder: ['A', 'B'],
        glyphs: {
          A: fontData.glyphs.A,
          B: {
            ...fontData.glyphs.A,
            id: 'B',
            name: 'B',
            unicodes: ['0042'],
          },
        },
      },
      projectMetadata: { familyName: 'Export Clean' },
      projectExportDirty: true,
      exportDirtyGlyphIds: ['A', 'B'],
    })

    await markKumikoProjectExportClean('project-export-clean', { batchSize: 1 })

    const [project, glyphA, glyphB, dirtyState] = await Promise.all([
      loadKumikoProjectRecord('project-export-clean'),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-export-clean', 'A')),
      loadKumikoGlyphRecord(makeKumikoGlyphKey('project-export-clean', 'B')),
      getKumikoProjectDirtyState('project-export-clean'),
    ])

    expect(project?.exportDirty).toBe(0)
    expect(project?.exportedDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(glyphA?.exportDirty).toBe(0)
    expect(glyphB?.exportDirty).toBe(0)
    expect(glyphA?.exportedDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(glyphB?.exportedDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(dirtyState.exportDirty).toBe(false)
    expect(dirtyState.exportDirtyGlyphIds).toEqual([])
  })

  it('rejects interpolable source layers that mix outline kinds', async () => {
    const mixedOutlineFontData: FontData = {
      ...fontData,
      settings: { outlineType: 'cubic' },
      glyphs: {
        A: {
          ...fontData.glyphs.A,
          layers: {
            master1: {
              ...fontData.glyphs.A.layers!['public.default']!,
              id: 'master1',
              name: 'master1',
              type: 'master',
              paths: [
                {
                  id: 'cubic-path',
                  closed: false,
                  nodes: [
                    {
                      id: 'n1',
                      kind: 'oncurve',
                      segmentType: 'line',
                      x: 0,
                      y: 0,
                    },
                    { id: 'h1', kind: 'offcurve', x: 10, y: 0 },
                    { id: 'h2', kind: 'offcurve', x: 20, y: 0 },
                    {
                      id: 'n2',
                      kind: 'oncurve',
                      segmentType: 'cubic',
                      x: 30,
                      y: 0,
                    },
                  ],
                },
              ],
            },
            master2: {
              ...fontData.glyphs.A.layers!['public.default']!,
              id: 'master2',
              name: 'master2',
              type: 'master',
              paths: [
                {
                  id: 'quad-path',
                  closed: false,
                  nodes: [
                    {
                      id: 'q1',
                      kind: 'oncurve',
                      segmentType: 'line',
                      x: 0,
                      y: 0,
                    },
                    { id: 'qh1', kind: 'offcurve', x: 10, y: 0 },
                    {
                      id: 'q2',
                      kind: 'oncurve',
                      segmentType: 'quadratic',
                      x: 20,
                      y: 0,
                    },
                  ],
                },
              ],
            },
          },
          layerOrder: ['master1', 'master2'],
        },
      },
    }

    await expect(
      saveProjectDraft({
        id: 'project-mixed-outline',
        title: 'Mixed Outline',
        lastModified: 20,
        createdAt: 10,
        updatedAt: 20,
        sourceName: 'Mixed.ufo',
        sourceType: 'local',
        fontData: mixedOutlineFontData,
        projectMetadata: null,
        projectSourceData: null,
        projectSourceFormat: 'ufo',
      })
    ).rejects.toThrow(/mixed outline kinds|outlineKind quadratic/)
  })

  it('persists editor UI state outside canonical glyph records', async () => {
    await saveProjectDraft({
      id: 'project-ui-state',
      title: 'Project UI State',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'ProjectUiState.ufo',
      sourceType: 'local',
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    await saveDraftSnapshot({
      projectId: 'project-ui-state',
      projectTitle: 'Project UI State',
      fontData,
      dirtyGlyphIds: [],
      deletedGlyphIds: [],
      projectUiState: {
        selectedGlyphId: 'A',
        selectedLayerId: 'public.default',
        activeMasterId: 'public.default',
        overviewSectionId: 'all',
        overviewTopGlyphId: 'A',
        overviewGridState: { scrollTop: 120 },
      },
      glyphEditTimes: {},
      selectedLayerId: 'public.default',
    })

    const loaded = await loadProjectDraftMetadata('project-ui-state')
    expect(loaded?.projectUiState).toEqual({
      selectedGlyphId: 'A',
      selectedLayerId: 'public.default',
      activeMasterId: 'public.default',
      overviewSectionId: 'all',
      overviewTopGlyphId: 'A',
      overviewGridState: { scrollTop: 120 },
    })
  })

  it('loads project drafts as glyph metadata without resident geometry', async () => {
    const componentFontData: FontData = {
      glyphOrder: ['B', 'A'],
      glyphs: {
        A: fontData.glyphs.A,
        B: {
          ...fontData.glyphs.A,
          id: 'B',
          name: 'B',
          unicodes: ['0042'],
          layers: {
            'public.default': {
              ...fontData.glyphs.A.layers!['public.default']!,
              componentRefs: [
                {
                  id: 'component-1',
                  glyphId: 'A',
                  x: 10,
                  y: 20,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              ],
            },
          },
        },
      },
    }
    await saveProjectDraft({
      id: 'project-metadata-draft',
      title: 'Metadata Draft',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'MetadataDraft.ufo',
      sourceType: 'local',
      fontData: componentFontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const metadataDraft = await loadProjectDraftMetadata(
      'project-metadata-draft'
    )
    const metadataRecords = await listKumikoGlyphMetadataForProject(
      'project-metadata-draft'
    )
    const fullGlyph = await loadProjectGlyphGeometry(
      'project-metadata-draft',
      'B'
    )

    expect(metadataRecords).toHaveLength(2)
    expect('layers' in metadataRecords[0]).toBe(false)
    expect(Object.keys(metadataDraft?.fontData?.glyphs ?? {})).toEqual([
      'B',
      'A',
    ])
    expect(metadataDraft?.fontData?.glyphs.B.layers).toBeUndefined()
    expect(metadataDraft?.fontData?.glyphs.B.componentGlyphIds).toEqual(['A'])
    expect(metadataDraft?.fontData?.glyphs.B.hasDrawableContent).toBe(true)
    expect(metadataDraft?.fontData?.glyphs.B.unicodes).toEqual(['0042'])
    expect(
      fullGlyph?.layers?.['public.default']?.componentRefs[0].glyphId
    ).toBe('A')
    expect(fullGlyph?.layers?.['public.default']?.componentRefs[0].x).toBe(10)
  })

  it('loads component referent geometry with a glyph geometry closure', async () => {
    const componentFontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: {
          ...fontData.glyphs.A,
          layers: {
            'public.default': {
              ...fontData.glyphs.A.layers!['public.default']!,
              paths: [
                {
                  id: 'path-1',
                  closed: true,
                  nodes: [
                    {
                      id: 'node-1',
                      kind: 'oncurve',
                      segmentType: 'line',
                      x: 1,
                      y: 2,
                    },
                  ],
                },
              ],
            },
          },
        },
        B: {
          ...fontData.glyphs.A,
          id: 'B',
          name: 'B',
          unicodes: ['0042'],
          layers: {
            'public.default': {
              ...fontData.glyphs.A.layers!['public.default']!,
              componentRefs: [
                {
                  id: 'component-1',
                  glyphId: 'A',
                  x: 10,
                  y: 20,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              ],
            },
          },
        },
      },
    }
    await saveProjectDraft({
      id: 'project-geometry-closure',
      title: 'Geometry Closure',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'GeometryClosure.ufo',
      sourceType: 'local',
      fontData: componentFontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const glyphs = await loadProjectGlyphGeometryClosure(
      'project-geometry-closure',
      ['B']
    )

    expect(glyphs.map((glyph) => glyph.id).sort()).toEqual(['A', 'B'])
    expect(
      glyphs.find((glyph) => glyph.id === 'A')?.layers?.['public.default']
        ?.paths[0].nodes[0].x
    ).toBe(1)
    expect(glyphs.find((glyph) => glyph.id === 'B')?.componentGlyphIds).toEqual(
      ['A']
    )
  })

  it('autosaves metadata-only glyph edits without replacing geometry', async () => {
    await saveProjectDraft({
      id: 'project-metadata-autosave',
      title: 'Metadata Autosave',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'MetadataAutosave.ufo',
      sourceType: 'local',
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })
    const originalGlyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-metadata-autosave', 'A')
    )

    const metadataDraft = await loadProjectDraftMetadata(
      'project-metadata-autosave'
    )
    const nextFontData: FontData = {
      ...metadataDraft!.fontData!,
      glyphs: {
        A: {
          ...metadataDraft!.fontData!.glyphs.A,
          unicodes: ['0061'],
          note: 'metadata autosave',
        },
      },
    }

    await saveDraftSnapshot({
      projectId: 'project-metadata-autosave',
      projectTitle: 'Metadata Autosave',
      fontData: nextFontData,
      dirtyGlyphIds: ['A'],
      deletedGlyphIds: [],
      glyphEditTimes: { A: 50 },
      selectedLayerId: 'public.default',
    })

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-metadata-autosave', 'A')
    )
    expect(glyph?.unicodes).toEqual(['0061'])
    expect(glyph?.note).toBe('metadata autosave')
    expect(glyph?.layers['public.default']?.metrics.width).toBe(500)
    expect(glyph?.exportDirty).toBe(1)
    expect(glyph?.syncDirty).toBe(1)
    expect(glyph?.exportedDigest).toBe(originalGlyph?.exportedDigest)
    expect(glyph?.syncedDigest).toBe(originalGlyph?.syncedDigest)
  })

  it('patches glyph metadata without replacing canonical geometry', async () => {
    const compositeFontData: FontData = {
      glyphOrder: ['A', 'B'],
      glyphs: {
        A: fontData.glyphs.A,
        B: {
          ...fontData.glyphs.A,
          id: 'B',
          name: 'B',
          unicodes: ['0042'],
          layers: {
            'public.default': {
              ...fontData.glyphs.A.layers!['public.default']!,
              paths: [
                {
                  id: 'path-1',
                  closed: true,
                  nodes: [
                    {
                      id: 'node-1',
                      kind: 'oncurve',
                      segmentType: 'line',
                      x: 1,
                      y: 2,
                    },
                  ],
                },
              ],
              componentRefs: [
                {
                  id: 'component-1',
                  glyphId: 'A',
                  x: 0,
                  y: 0,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              ],
            },
          },
        },
      },
    }
    await saveProjectDraft({
      id: 'project-metadata-patch',
      title: 'Metadata Patch',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'MetadataPatch.ufo',
      sourceType: 'local',
      fontData: compositeFontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    await patchKumikoGlyphMetadata({
      projectId: 'project-metadata-patch',
      glyphId: 'B',
      patch: {
        unicodes: ['u+62'],
        status: 2,
        note: 'metadata only',
      },
      updatedAt: 40,
      exportDirty: true,
      syncDirty: true,
    })

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-metadata-patch', 'B')
    )
    const unicodeGlyphs = await findKumikoGlyphRecordsByUnicode(
      'project-metadata-patch',
      '0062'
    )

    expect(glyph?.unicodes).toEqual(['0062'])
    expect(glyph?.unicodeKeys).toEqual([`project-metadata-patch\0${'0062'}`])
    expect(glyph?.status).toBe(2)
    expect(glyph?.note).toBe('metadata only')
    expect(glyph?.layers['public.default']?.paths[0].nodes[0].x).toBe(1)
    expect(glyph?.componentGlyphIds).toEqual(['A'])
    expect(glyph?.componentRefKeys).toEqual(['project-metadata-patch\0A'])
    expect(glyph?.exportDirty).toBe(1)
    expect(glyph?.syncDirty).toBe(1)
    expect(unicodeGlyphs.map((record) => record.glyphId)).toEqual(['B'])
  })

  it('updates metadata patch baselines only when marking a glyph clean', async () => {
    await saveProjectDraft({
      id: 'project-metadata-digest',
      title: 'Metadata Digest',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'MetadataDigest.ufo',
      sourceType: 'local',
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    const original = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-metadata-digest', 'A')
    )
    await patchKumikoGlyphMetadata({
      projectId: 'project-metadata-digest',
      glyphId: 'A',
      patch: { note: 'dirty metadata' },
      updatedAt: 40,
      exportDirty: true,
      syncDirty: true,
    })
    const dirty = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-metadata-digest', 'A')
    )

    expect(dirty?.exportDirty).toBe(1)
    expect(dirty?.syncDirty).toBe(1)
    expect(dirty?.exportedDigest).toBe(original?.exportedDigest)
    expect(dirty?.syncedDigest).toBe(original?.syncedDigest)

    await patchKumikoGlyphMetadata({
      projectId: 'project-metadata-digest',
      glyphId: 'A',
      patch: {},
      updatedAt: 50,
      exportDirty: false,
      syncDirty: false,
    })
    const clean = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-metadata-digest', 'A')
    )

    expect(clean?.exportDirty).toBe(0)
    expect(clean?.syncDirty).toBe(0)
    expect(clean?.exportedDigest).toMatch(/^[0-9a-f]{8}$/)
    expect(clean?.syncedDigest).toBe(clean?.exportedDigest)
    expect(clean?.exportedDigest).not.toBe(original?.exportedDigest)
  })

  it('rejects geometry-bearing sourceData in metadata patches', async () => {
    await saveProjectDraft({
      id: 'project-bad-metadata-patch',
      title: 'Bad Metadata Patch',
      lastModified: 20,
      createdAt: 10,
      updatedAt: 20,
      sourceName: 'BadMetadataPatch.ufo',
      sourceType: 'local',
      fontData,
      projectMetadata: null,
      projectSourceData: null,
      projectSourceFormat: 'ufo',
    })

    await expect(
      patchKumikoGlyphMetadata({
        projectId: 'project-bad-metadata-patch',
        glyphId: 'A',
        patch: {
          sourceData: {
            glyphs: {
              fields: {
                paths: [],
              },
            },
          },
        },
      })
    ).rejects.toThrow(/geometry key/)

    const glyph = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey('project-bad-metadata-patch', 'A')
    )
    expect(glyph?.sourceData).toBeUndefined()
  })
})
