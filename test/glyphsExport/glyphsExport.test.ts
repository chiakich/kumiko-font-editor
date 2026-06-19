import { describe, expect, it } from 'vitest'
import { serializeGlyphsFileToBlob } from 'src/lib/fontFormats/glyphsExport'
import { createGlyphsPackageDataFromFontData } from 'src/lib/fontFormats/glyphsPackage'
import type { GlyphsDocument } from 'src/lib/fontFormats/glyphsDocument'
import type { FontData, GlyphData } from 'src/store'

const glyph = (id: string, name: string, unicode: string | null): GlyphData =>
  ({
    id,
    name,
    unicodes: unicode ? [unicode] : [],
    metrics: { width: 1000, lsb: 0, rsb: 0 },
    paths: [],
    components: [],
    componentRefs: [],
  }) as unknown as GlyphData

describe('serializeGlyphsFileToBlob glyph matching', () => {
  it('keeps a second glyph that shares a unicode with another', async () => {
    const fontData = {
      glyphs: {
        A: glyph('A', 'A', '0041'),
        'A.alt': glyph('A.alt', 'A.alt', '0041'),
      },
    } as unknown as FontData
    // The original document only knows about A; A.alt is a new glyph that also
    // carries unicode 0041 — it must not be dropped on export.
    const document = {
      glyphs: [{ glyphname: 'A', unicode: '0041' }],
    } as unknown as GlyphsDocument

    const text = await serializeGlyphsFileToBlob(
      fontData,
      null,
      document
    ).text()

    expect(text).toContain('A.alt')
    expect(text).toMatch(/glyphname = A\b/)
  })

  it('can force Glyphs 2 or Glyphs 3 geometry output', async () => {
    const fontData = {
      glyphs: {
        A: {
          ...glyph('A', 'A', '0041'),
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
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
                    {
                      id: 'n2',
                      x: 100,
                      y: 0,
                      kind: 'oncurve',
                      segmentType: 'line',
                    },
                  ],
                },
              ],
              components: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 500, lsb: 0, rsb: 400 },
            },
          },
          layerOrder: ['M1'],
          activeLayerId: 'M1',
        },
      },
    } as unknown as FontData

    const glyphs2 = await serializeGlyphsFileToBlob(
      fontData,
      null,
      null,
      2
    ).text()
    const glyphs3 = await serializeGlyphsFileToBlob(
      fontData,
      null,
      null,
      3
    ).text()

    expect(glyphs2).toContain('paths')
    expect(glyphs2).toContain('0 0 LINE')
    expect(glyphs2).not.toContain('.formatVersion')
    expect(glyphs3).toContain('.formatVersion = 3')
    expect(glyphs3).toContain('shapes')
    expect(glyphs3).toContain('(0,0,l)')
  })

  it('uses glyph id, not display name, as exported glyphname', async () => {
    const fontData = {
      glyphs: {
        arrowleft: {
          ...glyph('arrowleft', '←', '2190'),
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
              associatedMasterId: 'M1',
              paths: [],
              components: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 500, lsb: 0, rsb: 500 },
            },
          },
          layerOrder: ['M1'],
          activeLayerId: 'M1',
        },
      },
    } as unknown as FontData

    const text = await serializeGlyphsFileToBlob(fontData, null, null, 3).text()

    expect(text).toContain('glyphname = arrowleft')
    expect(text).not.toContain('glyphname = "←"')
  })

  it('emits a Glyphs 3 transform matrix for sheared components', async () => {
    const fontData = {
      glyphs: {
        base: {
          ...glyph('base', 'base', null),
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
              associatedMasterId: 'M1',
              paths: [],
              components: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 500, lsb: 0, rsb: 500 },
            },
          },
          layerOrder: ['M1'],
          activeLayerId: 'M1',
        },
        composite: {
          ...glyph('composite', 'composite', null),
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
              associatedMasterId: 'M1',
              paths: [],
              components: ['base'],
              componentRefs: [
                {
                  id: 'c1',
                  glyphId: 'base',
                  x: 20,
                  y: 30,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                  xyScale: 0.2,
                  yxScale: 0,
                },
              ],
              anchors: [],
              guidelines: [],
              metrics: { width: 500, lsb: 0, rsb: 500 },
            },
          },
          layerOrder: ['M1'],
          activeLayerId: 'M1',
        },
      },
    } as unknown as FontData
    const document = {
      '.formatVersion': 3,
      fontMaster: [{ id: 'M1', name: 'Regular' }],
      glyphs: [
        { glyphname: 'base', layers: [{ layerId: 'M1', width: 500 }] },
        { glyphname: 'composite', layers: [{ layerId: 'M1', width: 500 }] },
      ],
    } as unknown as GlyphsDocument

    const text = await serializeGlyphsFileToBlob(
      fontData,
      null,
      document
    ).text()

    expect(text).toContain('ref = base')
    expect(text).toContain('transform = (1,0.2,0,1,20,30)')
    expect(text).not.toContain('scale = (1,1)')
  })

  it('generates a Glyphs package from canonical fontData', () => {
    const fontData = {
      unitsPerEm: 1000,
      glyphs: {
        A: {
          ...glyph('A', 'A', '0041'),
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
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
                    {
                      id: 'n2',
                      x: 100,
                      y: 0,
                      kind: 'oncurve',
                      segmentType: 'line',
                    },
                  ],
                },
              ],
              components: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 500, lsb: 0, rsb: 400 },
            },
          },
          layerOrder: ['M1'],
          activeLayerId: 'M1',
        },
      },
    } as unknown as FontData

    const packageData = createGlyphsPackageDataFromFontData({
      fontData,
      projectMetadata: {
        familyName: 'Canon',
        fontMasters: [{ id: 'M1', name: 'Regular' }],
      },
      packageName: 'Canon',
    })

    expect(packageData.packageName).toBe('Canon.glyphspackage')
    expect(Object.keys(packageData.files).sort()).toEqual([
      'fontinfo.plist',
      'glyphs/A.glyph',
      'order.plist',
    ])
    expect(packageData.files['fontinfo.plist']).toContain('.formatVersion = 3')
    expect(packageData.files['fontinfo.plist']).toContain('familyName = Canon')
    expect(packageData.files['fontinfo.plist']).not.toContain('glyphs =')
    expect(packageData.files['glyphs/A.glyph']).toContain('glyphname = A')
    expect(packageData.files['glyphs/A.glyph']).toContain('shapes')
    expect(packageData.files['glyphs/A.glyph']).toContain('(0,0,l)')
    expect(packageData.files['order.plist']).toContain('A')
  })
})
