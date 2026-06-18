import { describe, expect, it } from 'vitest'
import {
  fontDataToKumikoGlyphRecords,
  fontDataToKumikoProjectRecord,
  kumikoRecordsToFontData,
} from 'src/lib/project/kumikoFontDataAdapter'
import type { FontData } from 'src/store'

const fontData = {
  unitsPerEm: 1000,
  glyphOrder: ['A'],
  sources: {
    M1: { id: 'M1', name: 'Regular', location: { Weight: 400 } },
  },
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicode: '0041',
      production: 'A',
      export: true,
      activeLayerId: 'M1',
      layerOrder: ['M1', 'backup-1'],
      layers: {
        M1: {
          id: 'M1',
          name: 'Regular',
          type: 'master',
          associatedMasterId: 'M1',
          paths: [
            {
              id: 'p1',
              closed: true,
              nodes: [
                {
                  id: 'n1',
                  x: 0,
                  y: 0,
                  kind: 'oncurve',
                  segmentType: 'line',
                },
              ],
            },
          ],
          components: [],
          componentRefs: [],
          anchors: [{ id: 'a1', name: 'top', x: 250, y: 700 }],
          guidelines: [],
          metrics: { width: 500, lsb: 0, rsb: 500 },
        },
        'backup-1': {
          id: 'backup-1',
          name: 'Sketch',
          type: 'backup',
          associatedMasterId: 'M1',
          paths: [],
          components: ['base'],
          componentRefs: [
            {
              id: 'c1',
              glyphId: 'base',
              x: 10,
              y: 20,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
            },
          ],
          anchors: [],
          guidelines: [],
          metrics: { width: 500, lsb: 0, rsb: 500 },
        },
      },
    },
  },
} satisfies FontData

describe('kumikoFontDataAdapter', () => {
  it('splits FontData into project and per-glyph records', () => {
    const project = fontDataToKumikoProjectRecord({
      projectId: 'project-1',
      title: 'Test',
      fontData,
      createdAt: 10,
      updatedAt: 20,
      sourceFormat: 'glyphs',
    })
    const glyphs = fontDataToKumikoGlyphRecords({
      projectId: 'project-1',
      fontData,
      updatedAt: 20,
      dirtyGlyphIds: ['A'],
    })

    expect(project).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-1',
      title: 'Test',
      sourceFormat: 'glyphs',
      glyphOrder: ['A'],
      unitsPerEm: 1000,
    })
    expect(glyphs).toHaveLength(1)
    expect(glyphs[0]).toMatchObject({
      schemaVersion: 1,
      projectId: 'project-1',
      glyphId: 'A',
      unicodes: ['0041'],
      dirty: true,
      dirtyIndex: 1,
      layerOrder: ['M1', 'backup-1'],
    })
    expect(glyphs[0].layers['backup-1'].componentRefs[0]).toMatchObject({
      glyphId: 'base',
      x: 10,
      y: 20,
    })
  })

  it('rebuilds runtime FontData from canonical records', () => {
    const project = fontDataToKumikoProjectRecord({
      projectId: 'project-1',
      title: 'Test',
      fontData,
      createdAt: 10,
      updatedAt: 20,
    })
    const glyphs = fontDataToKumikoGlyphRecords({
      projectId: 'project-1',
      fontData,
      updatedAt: 20,
    })

    const rebuilt = kumikoRecordsToFontData(project, glyphs)

    expect(rebuilt.glyphOrder).toEqual(['A'])
    expect(rebuilt.sources?.M1.location).toEqual({ Weight: 400 })
    expect(rebuilt.glyphs.A.unicode).toBe('0041')
    expect(rebuilt.glyphs.A.layerOrder).toEqual(['M1', 'backup-1'])
    expect(rebuilt.glyphs.A.layers?.M1.anchors[0]).toMatchObject({
      name: 'top',
      x: 250,
      y: 700,
    })
  })
})
