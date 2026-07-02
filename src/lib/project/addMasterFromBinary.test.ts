import 'fake-indexeddb/auto'

import { describe, it, expect } from 'vitest'
import { addMasterFromBinaryToProject } from './addMasterFromBinary'
import {
  loadKumikoGlyphRecord,
  loadKumikoProjectRecord,
  makeKumikoGlyphKey,
  saveKumikoGlyphRecordBatch,
  saveKumikoProjectRecord,
} from './kumikoProjectPersistence'
import {
  glyphDataToKumikoGlyphRecord,
  kumikoGlyphRecordToGlyphData,
} from './kumikoFontDataAdapter'
import { getGlyphMasterLayerForSource } from 'src/font/designspaceLocation'
import type { FontData, FontSource, GlyphData, PathNode } from 'src/store'

const node = (x: number, y: number, id: string): PathNode => ({
  id,
  x,
  y,
  kind: 'oncurve',
  segmentType: 'line',
})

const makeGlyph = (id: string, unicodes: string[], x: number): GlyphData => ({
  id,
  name: id,
  unicodes,
  activeLayerId: 'public.default',
  layerOrder: ['public.default'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      associatedMasterId: 'public.default',
      paths: [{ id: 'p0', nodes: [node(x, 0, 'n0')], closed: true }],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
  },
})

describe('addMasterFromBinaryToProject', () => {
  it('adds a source and imports outlines into every matched glyph record', async () => {
    const projectId = 'proj-1'
    const now = 1000

    await saveKumikoProjectRecord({
      schemaVersion: 1,
      projectId,
      title: 'Test',
      createdAt: now,
      updatedAt: now,
      glyphOrder: ['A', 'B'],
      exportDirty: 0,
      syncDirty: 0,
      sources: {
        default: { id: 'default', name: 'Regular', location: { Weight: 400 } },
      },
    })
    await saveKumikoGlyphRecordBatch(
      [makeGlyph('A', ['0041'], 0), makeGlyph('B', ['0042'], 0)].map((glyph) =>
        glyphDataToKumikoGlyphRecord({ projectId, glyph, updatedAt: now })
      )
    )

    const source: FontSource = {
      id: 'bold',
      name: 'Bold',
      location: { Weight: 700 },
    }
    const binaryFontData: Pick<FontData, 'glyphs'> = {
      glyphs: {
        A: makeGlyph('A', ['0041'], 111),
        Balt: makeGlyph('Balt', ['0042'], 222),
      },
    }

    const result = await addMasterFromBinaryToProject({
      projectId,
      binaryFontData,
      source,
      now: 2000,
    })

    expect(result.matchedCount).toBe(2)
    expect(result.unmatchedGlyphIds).toEqual([])

    const project = await loadKumikoProjectRecord(projectId)
    expect(project?.sources?.bold).toMatchObject({ id: 'bold', name: 'Bold' })

    const recordA = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey(projectId, 'A')
    )
    const glyphA = kumikoGlyphRecordToGlyphData(recordA!)
    expect(
      getGlyphMasterLayerForSource(glyphA, 'bold')?.paths[0].nodes[0].x
    ).toBe(111)

    const recordB = await loadKumikoGlyphRecord(
      makeKumikoGlyphKey(projectId, 'B')
    )
    const glyphB = kumikoGlyphRecordToGlyphData(recordB!)
    expect(
      getGlyphMasterLayerForSource(glyphB, 'bold')?.paths[0].nodes[0].x
    ).toBe(222)
  })
})
