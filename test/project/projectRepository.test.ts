import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import {
  saveProjectDraft,
  loadProjectDraft,
} from 'src/lib/project/projectRepository'
import {
  listExportDirtyKumikoGlyphRecords,
  loadKumikoProjectRecord,
} from 'src/lib/project/kumikoProjectPersistence'
import { openDatabase } from 'src/lib/project/persistence'
import type { FontData } from 'src/store'

const fontData: FontData = {
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicode: '0041',
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
    const loaded = await loadProjectDraft('project-1')

    expect(projectRecord?.sourceData?.glyphs?.formatVersion).toBe(3)
    expect(dirtyGlyphs.map((glyph) => glyph.glyphId)).toEqual(['A'])
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
})
