import { describe, expect, it } from 'vitest'
import {
  findGeometryBearingSourceDataKey,
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
      unicodes: ['u+0041', '41'],
      production: 'A',
      export: true,
      note: 'keep me',
      leftMetricsKey: 'H',
      customData: { glyphFlag: true },
      activeLayerId: 'M1',
      layerOrder: ['M1', 'backup-1'],
      layers: {
        M1: {
          id: 'M1',
          name: 'Regular',
          type: 'master',
          associatedMasterId: 'M1',
          hints: [{ kind: 'stem', x: 12 }],
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
          image: {
            fileName: 'sketch.png',
            xScale: 1,
            yScale: 1,
          },
          customData: { layerFlag: true },
        },
        'backup-1': {
          id: 'backup-1',
          name: 'Sketch',
          type: 'brace',
          associatedMasterId: 'M1',
          braceLocation: { Weight: 500 },
          bracketAxisRules: { Weight: { min: 450, max: 700 } },
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
              xyScale: 0.25,
              yxScale: -0.5,
              rotation: 0,
              autoAlign: true,
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
      exportDirtyGlyphIds: ['A'],
      syncDirtyGlyphIds: ['A'],
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
      displayName: null,
      exportDirty: 1,
      syncDirty: 1,
      componentGlyphIds: ['base'],
      unicodeKeys: [`project-1${'\0'}0041`],
      componentRefKeys: [`project-1${'\0'}base`],
      layerOrder: ['M1', 'backup-1'],
      note: 'keep me',
      leftMetricsKey: 'H',
      customData: { glyphFlag: true },
    })
    expect(glyphs[0].layers.M1.outlineKind).toBe('cubic')
    expect(glyphs[0].layers.M1.hints).toEqual([{ kind: 'stem', x: 12 }])
    expect(glyphs[0].layers.M1.image?.fileName).toBe('sketch.png')
    expect(glyphs[0].layers.M1.customData).toEqual({ layerFlag: true })
    expect(glyphs[0].layers['backup-1'].componentRefs[0]).toMatchObject({
      glyphId: 'base',
      autoAlign: true,
      transform: {
        a: 1,
        b: 0.25,
        c: -0.5,
        d: 1,
        e: 10,
        f: 20,
      },
    })
    expect('components' in glyphs[0].layers['backup-1']).toBe(false)
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
    expect(rebuilt.glyphs.A.unicodes).toEqual(['0041'])
    expect(rebuilt.glyphs.A.note).toBe('keep me')
    expect(rebuilt.glyphs.A.leftMetricsKey).toBe('H')
    expect(rebuilt.glyphs.A.customData).toEqual({ glyphFlag: true })
    expect(rebuilt.glyphs.A.layerOrder).toEqual(['M1', 'backup-1'])
    expect(rebuilt.glyphs.A.layers?.M1.anchors[0]).toMatchObject({
      name: 'top',
      x: 250,
      y: 700,
    })
    expect(rebuilt.glyphs.A.layers?.M1.image?.fileName).toBe('sketch.png')
    expect(rebuilt.glyphs.A.layers?.M1.hints).toEqual([{ kind: 'stem', x: 12 }])
    expect(rebuilt.glyphs.A.layers?.M1.customData).toEqual({
      layerFlag: true,
    })
    expect(
      rebuilt.glyphs.A.layers?.['backup-1'].componentRefs[0]
    ).toMatchObject({
      glyphId: 'base',
      autoAlign: true,
      x: 10,
      y: 20,
      scaleX: 1,
      scaleY: 1,
      xyScale: 0.25,
      yxScale: -0.5,
      rotation: 0,
    })
    expect(rebuilt.glyphs.A.layers?.['backup-1']).toMatchObject({
      type: 'brace',
      braceLocation: { Weight: 500 },
      bracketAxisRules: { Weight: { min: 450, max: 700 } },
    })
  })

  it('sanitizes invalid unicode values when rebuilding runtime FontData', () => {
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
    glyphs[0].unicodes = ['0041', '983046', '110000']

    const rebuilt = kumikoRecordsToFontData(project, glyphs)

    expect(rebuilt.glyphs.A.unicodes).toEqual(['0041'])
  })

  it('rejects metadata-only glyphs when serializing complete glyph records', () => {
    const metadataOnlyFontData: FontData = {
      glyphOrder: ['A'],
      glyphs: {
        A: {
          id: 'A',
          name: 'A',
          unicodes: ['0041'],
          layerOrder: ['M1'],
        },
      },
    }

    expect(() =>
      fontDataToKumikoGlyphRecords({
        projectId: 'project-1',
        fontData: metadataOnlyFontData,
        updatedAt: 20,
      })
    ).toThrow(/metadata-only glyph A/)
  })

  it('detects geometry-bearing keys inside sourceData', () => {
    expect(
      findGeometryBearingSourceDataKey({
        glyphs: { documentFields: { customParameters: [] } },
      })
    ).toBeNull()
    expect(
      findGeometryBearingSourceDataKey({
        glyphs: { documentFields: { shapes: [] } },
      })
    ).toBe('sourceData.glyphs.documentFields.shapes')
  })

  it('rejects sourceData that duplicates glyph geometry', () => {
    expect(() =>
      fontDataToKumikoProjectRecord({
        projectId: 'project-1',
        title: 'Bad Source Data',
        fontData,
        createdAt: 10,
        updatedAt: 20,
        sourceData: {
          glyphs: {
            documentFields: { paths: [] },
          },
        },
      })
    ).toThrow(/geometry key/)
  })

  it('rejects geometry-bearing sourceData on glyph elements', () => {
    const withNodeSourceData: FontData = structuredClone(fontData)
    withNodeSourceData.glyphs.A.layers!.M1.paths[0].nodes[0].sourceData = {
      glyphs: { points: [] },
    }

    expect(() =>
      fontDataToKumikoGlyphRecords({
        projectId: 'project-1',
        fontData: withNodeSourceData,
        updatedAt: 20,
      })
    ).toThrow(/geometry key: node\(n1\)/)

    const withComponentSourceData: FontData = structuredClone(fontData)
    withComponentSourceData.glyphs.A.layers![
      'backup-1'
    ].componentRefs[0].sourceData = {
      glyphs: { components: [] },
    }

    expect(() =>
      fontDataToKumikoGlyphRecords({
        projectId: 'project-1',
        fontData: withComponentSourceData,
        updatedAt: 20,
      })
    ).toThrow(/geometry key: component\(c1\)/)
  })
})
