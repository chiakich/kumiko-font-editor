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
                  autoAlign: false,
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
    expect(text).toContain('automaticAlignment = 0')
    expect(text).not.toContain('scale = (1,1)')
  })

  it('emits brace and bracket layer attributes from canonical layer metadata', async () => {
    const fontData = {
      glyphs: {
        A: {
          ...glyph('A', 'A', '0041'),
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
              type: 'master',
              associatedMasterId: 'M1',
              paths: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 500, lsb: 0, rsb: 500 },
            },
            brace: {
              id: 'brace',
              name: 'Brace',
              type: 'brace',
              associatedMasterId: 'M1',
              braceLocation: { Weight: 150 },
              paths: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 520, lsb: 0, rsb: 520 },
            },
            bracket: {
              id: 'bracket',
              name: 'Bracket',
              type: 'bracket',
              associatedMasterId: 'M1',
              bracketAxisRules: { Weight: { min: 150, max: 200 } },
              paths: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width: 530, lsb: 0, rsb: 530 },
            },
          },
          layerOrder: ['M1', 'brace', 'bracket'],
          activeLayerId: 'M1',
        },
      },
    } as unknown as FontData

    const text = await serializeGlyphsFileToBlob(fontData, null, null, 3).text()

    expect(text).toContain('coordinates = {')
    expect(text).toContain('Weight = 150')
    expect(text).toContain('axisRules = {')
    expect(text).toContain('min = 150')
    expect(text).toContain('max = 200')
  })

  it('emits canonical and preserved Glyphs metadata fields', async () => {
    const fontData = {
      glyphs: {
        A: {
          ...glyph('A', 'A', '0041'),
          note: 'Needs review',
          leftMetricsKey: 'H',
          rightMetricsKey: 'O',
          customData: { reviewed: 1 },
          sourceData: { glyphs: { fields: { script: 'latin' } } },
          layers: {
            M1: {
              id: 'M1',
              name: 'Regular',
              associatedMasterId: 'M1',
              locked: true,
              visible: false,
              image: {
                fileName: 'Images/A.png',
                xScale: 1,
                xyScale: 0.1,
                yxScale: 0.2,
                yScale: 1,
                xOffset: 30,
                yOffset: 40,
                customData: { alpha: 60 },
              },
              background: {
                paths: [
                  {
                    id: 'bgp1',
                    closed: false,
                    nodes: [
                      {
                        id: 'bgn1',
                        x: 10,
                        y: 10,
                        kind: 'oncurve',
                        segmentType: 'line',
                      },
                      {
                        id: 'bgn2',
                        x: 90,
                        y: 10,
                        kind: 'oncurve',
                        segmentType: 'line',
                      },
                    ],
                  },
                ],
                componentRefs: [],
                anchors: [],
                guidelines: [],
                metrics: { width: 500, lsb: 0, rsb: 500 },
              },
              customData: { layerFlag: 1 },
              sourceData: { glyphs: { fields: { color: 3 } } },
              paths: [],
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

    const text = await serializeGlyphsFileToBlob(fontData, null, null, 2).text()

    expect(text).toContain('note = "Needs review"')
    expect(text).toContain('leftMetricsKey = H')
    expect(text).toContain('rightMetricsKey = O')
    expect(text).toContain('script = latin')
    expect(text).toContain('userData = {')
    expect(text).toContain('reviewed = 1')
    expect(text).toContain('locked = 1')
    expect(text).toContain('visible = 0')
    expect(text).toContain('layerFlag = 1')
    expect(text).toContain('color = 3')
    expect(text).toContain('backgroundImage = {')
    expect(text).toContain('path = Images/A.png')
    expect(text).toContain('transform = "{1, 0.1, 0.2, 1, 30, 40}"')
    expect(text).toContain('alpha = 60')
    expect(text).toContain('background = {')
    expect(text).toContain('10 10 LINE')
    expect(text).toContain('90 10 LINE')
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
