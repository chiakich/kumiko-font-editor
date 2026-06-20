import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseOpenStep } from 'src/lib/fontFormats/openstepParser'
import { buildFontDataFromGlyphsDocument } from 'src/lib/fontFormats/glyphsImport'
import { serializeGlyphsFileToBlob } from 'src/lib/fontFormats/glyphsExport'
import {
  extractGlyphsMetadata,
  type GlyphsDocument,
} from 'src/lib/fontFormats/glyphsDocument'
import { getGlyphLayer } from 'src/store/glyphLayer'
import { getGlyphDisplayCharacter } from 'src/lib/glyph/glyphOverview'

const G2 = `{
familyName = "TestFamily";
unitsPerEm = 1000;
fontMaster = (
{ id = "m01"; name = "Regular"; weightValue = 100; ascender = 800; descender = -200; },
{ id = "m02"; name = "Bold"; weightValue = 200; }
);
glyphs = (
{
glyphname = A;
unicode = 65;
note = "Needs review";
leftMetricsKey = H;
rightMetricsKey = O;
userData = { reviewed = 1; };
script = latin;
layers = (
{
layerId = "m01";
width = 500;
locked = 1;
visible = 0;
userData = { layerFlag = 1; };
color = 3;
backgroundImage = { path = "Images/A.png"; transform = "{1, 0.1, 0.2, 1, 30, 40}"; alpha = 60; };
background = { width = 500; paths = ( { closed = 0; nodes = ( "10 10 LINE", "90 10 LINE" ); } ); };
paths = (
{ closed = 1; nodes = ( "100 0 LINE", "400 0 LINE", "400 700 CURVE SMOOTH", "250 750 OFFCURVE", "100 700 LINE" ); }
);
anchors = ( { name = top; position = "{250, 700}"; } );
},
{
layerId = "m02";
width = 600;
paths = (
{ closed = 1; nodes = ( "120 0 LINE", "480 0 LINE", "480 700 LINE", "120 700 LINE" ); }
);
}
);
},
{
glyphname = Aacute;
unicode = 193;
layers = (
{ layerId = "m01"; width = 500; components = ( { name = A; transform = "{1, 0, 0, 1, 50, 0}"; automaticAlignment = 0; } ); },
{ layerId = "m02"; width = 600; components = ( { name = A; } ); },
{ layerId = "brace.500"; associatedMasterId = "m01"; width = 540; attributes = { coordinates = { Weight = 150; }; }; paths = ( { closed = 0; nodes = ( "0 0 LINE", "100 0 LINE" ); } ); },
{ layerId = "bracket.150-200"; associatedMasterId = "m01"; width = 550; attributes = { axisRules = { Weight = { min = 150; max = 200; }; }; }; paths = ( { closed = 0; nodes = ( "0 10 LINE", "100 10 LINE" ); } ); }
);
}
);
}`

const G3 = `{
.formatVersion = 3;
familyName = "TestThree";
unitsPerEm = 1000;
Axes = ( { Name = Weight; Tag = wght; } );
fontMaster = (
{ id = "M1"; name = Regular; axesValues = ( 100 ); },
{ id = "M2"; name = Bold; axesValues = ( 200 ); }
);
glyphs = (
{
glyphname = B;
unicode = 66;
layers = (
{ layerId = "M1"; width = 520; shapes = ( { closed = 1; nodes = ( (100,0,l), (400,0,l), (400,700,ls), (100,700,l) ); } ); },
{ layerId = "M2"; width = 620; shapes = ( { closed = 1; nodes = ( (120,0,l), (480,0,l), (480,700,l), (120,700,l) ); } ); }
);
}
);
}`

const parse = (text: string) => parseOpenStep(text) as GlyphsDocument

describe('buildFontDataFromGlyphsDocument (Glyphs 2)', () => {
  const fontData = buildFontDataFromGlyphsDocument(parse(G2))

  it('creates one source per fontMaster keyed by master id', () => {
    expect(Object.keys(fontData.sources ?? {})).toEqual(['m01', 'm02'])
    expect(fontData.sources?.m02.location).toEqual({ Weight: 200 })
  })

  it('derives a weight axis from weightValue', () => {
    expect(fontData.axes?.axes[0]).toMatchObject({
      tag: 'wght',
      minValue: 100,
      defaultValue: 100,
      maxValue: 200,
    })
  })

  it('builds one master layer per source with parsed nodes', () => {
    const glyph = fontData.glyphs.A
    expect(glyph.activeLayerId).toBe('m01')
    expect(glyph.layerOrder).toEqual(['m01', 'm02'])
    const m01 = getGlyphLayer(glyph, 'm01')
    expect(m01?.paths[0].nodes[0]).toMatchObject({
      x: 100,
      y: 0,
      kind: 'oncurve',
      segmentType: 'line',
    })
    expect(m01?.paths[0].nodes[2]).toMatchObject({
      kind: 'oncurve',
      smooth: true,
    })
    expect(m01?.paths[0].nodes[3]).toMatchObject({ kind: 'offcurve' })
  })

  it('keeps unicode as zero-padded hex', () => {
    expect(fontData.glyphs.A.unicodes).toEqual(['0041'])
    expect(fontData.glyphs.Aacute.unicodes).toEqual(['00C1'])
  })

  it('computes metrics from outline bounds', () => {
    const m01 = getGlyphLayer(fontData.glyphs.A, 'm01')
    expect(m01?.metrics.width).toBe(500)
    expect(m01?.metrics.lsb).toBe(100)
    expect(m01?.metrics.rsb).toBe(100)
  })

  it('parses anchors', () => {
    const m01 = getGlyphLayer(fontData.glyphs.A, 'm01')
    expect(m01?.anchors[0]).toMatchObject({ name: 'top', x: 250, y: 700 })
  })

  it('keeps glyph and layer non-geometry metadata', () => {
    const glyph = fontData.glyphs.A
    const m01 = getGlyphLayer(glyph, 'm01')

    expect(glyph).toMatchObject({
      note: 'Needs review',
      leftMetricsKey: 'H',
      rightMetricsKey: 'O',
      customData: { reviewed: 1 },
      sourceData: { glyphs: { fields: { script: 'latin' } } },
    })
    expect(m01).toMatchObject({
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
            closed: false,
            nodes: [
              { x: 10, y: 10, kind: 'oncurve', segmentType: 'line' },
              { x: 90, y: 10, kind: 'oncurve', segmentType: 'line' },
            ],
          },
        ],
      },
      customData: { layerFlag: 1 },
      sourceData: { glyphs: { fields: { color: 3 } } },
    })
  })

  it('parses component transforms', () => {
    const ref = getGlyphLayer(fontData.glyphs.Aacute, 'm01')?.componentRefs[0]
    expect(ref).toMatchObject({
      glyphId: 'A',
      scaleX: 1,
      scaleY: 1,
      x: 50,
      y: 0,
      autoAlign: false,
    })
  })

  it('parses brace and bracket layer attributes into canonical layer metadata', () => {
    const brace = getGlyphLayer(fontData.glyphs.Aacute, 'brace.500')
    const bracket = getGlyphLayer(fontData.glyphs.Aacute, 'bracket.150-200')

    expect(brace).toMatchObject({
      type: 'brace',
      associatedMasterId: 'm01',
      braceLocation: { Weight: 150 },
    })
    expect(bracket).toMatchObject({
      type: 'bracket',
      associatedMasterId: 'm01',
      bracketAxisRules: { Weight: { min: 150, max: 200 } },
    })
  })
})

describe('buildFontDataFromGlyphsDocument (Glyphs 3)', () => {
  const fontData = buildFontDataFromGlyphsDocument(parse(G3))

  it('reads axes from the Axes block and axesValues', () => {
    expect(fontData.axes?.axes[0]).toMatchObject({
      tag: 'wght',
      minValue: 100,
      maxValue: 200,
    })
    expect(fontData.sources?.M2.location).toEqual({ Weight: 200 })
  })

  it('parses tuple nodes inside shapes', () => {
    const m1 = getGlyphLayer(fontData.glyphs.B, 'M1')
    expect(m1?.paths[0].nodes[0]).toMatchObject({
      x: 100,
      y: 0,
      kind: 'oncurve',
      segmentType: 'line',
    })
    expect(m1?.paths[0].nodes[2]).toMatchObject({
      kind: 'oncurve',
      smooth: true,
    })
    expect(m1?.metrics.width).toBe(520)
  })

  it('reads decimal high-plane private-use unicode values from a compact ChiakiTRFont fixture', async () => {
    const text = await readFile(
      new URL(
        '../fixtures/glyphs/ChiakiTRFont-decimal-unicode.glyphs',
        import.meta.url
      ),
      'utf8'
    )
    const privateUse = buildFontDataFromGlyphsDocument(parse(text))

    expect(privateUse.glyphs.A.unicodes).toEqual(['0041'])
    expect(privateUse.glyphs.A.name).toBe('A')
    expect(privateUse.glyphs.F0006.unicodes).toEqual(['F0006'])
    expect(privateUse.glyphs.F0006.name).toBe('F0006')
    expect(getGlyphDisplayCharacter(privateUse.glyphs.F0006)).toBe(
      String.fromCodePoint(0xf0006)
    )
  })

  it('drops invalid unicode values instead of importing crashable code points', () => {
    const invalid = buildFontDataFromGlyphsDocument(
      parse(`{
.formatVersion = 3;
fontMaster = ( { id = "M1"; name = Regular; } );
glyphs = (
{
glyphname = badUnicode;
unicode = 9999999;
layers = (
{ layerId = "M1"; width = 500; shapes = ( { closed = 0; nodes = ( (0,0,l), (100,0,l) ); } ); }
);
}
);
}`)
    )

    expect(invalid.glyphs.badUnicode.unicodes).toEqual([])
    expect(invalid.glyphs.badUnicode.name).toBe('badUnicode')
  })

  it('preserves quadratic q/qs node semantics', () => {
    const quadratic = buildFontDataFromGlyphsDocument(
      parse(`{
.formatVersion = 3;
fontMaster = ( { id = "M1"; name = Regular; } );
glyphs = (
{
glyphname = quad;
layers = (
{ layerId = "M1"; width = 500; shapes = ( { closed = 0; nodes = ( (0,0,l), (50,100,o), (100,0,qs) ); } ); }
);
}
);
}`)
    )
    const layer = getGlyphLayer(quadratic.glyphs.quad, 'M1')
    expect(layer?.paths[0].nodes[1]).toMatchObject({ kind: 'offcurve' })
    expect(layer?.paths[0].nodes[2]).toMatchObject({
      kind: 'oncurve',
      segmentType: 'quadratic',
      smooth: true,
    })
  })
})

describe('round-trip import -> serialize -> import', () => {
  it('preserves masters and node coordinates (G2 source stays G2)', async () => {
    const document = parse(G2)
    const fontData = buildFontDataFromGlyphsDocument(document)
    const text = await serializeGlyphsFileToBlob(
      fontData,
      extractGlyphsMetadata(document),
      document
    ).text()

    // G2 source keeps G2 geometry (string nodes, no shapes).
    expect(text).toContain('100 0 LINE')
    expect(text).not.toContain('shapes')

    const reimported = buildFontDataFromGlyphsDocument(parse(text))
    expect(Object.keys(reimported.sources ?? {})).toEqual(['m01', 'm02'])
    const m01 = getGlyphLayer(reimported.glyphs.A, 'm01')
    expect(m01?.paths[0].nodes[0]).toMatchObject({ x: 100, y: 0 })
    expect(m01?.metrics.width).toBe(500)
  })

  it('emits native G3 geometry for a G3 source', async () => {
    const document = parse(G3)
    const fontData = buildFontDataFromGlyphsDocument(document)
    const text = await serializeGlyphsFileToBlob(
      fontData,
      extractGlyphsMetadata(document),
      document
    ).text()

    // G3 source produces shapes with compact tuple nodes, not G2 string nodes.
    expect(text).toContain('shapes')
    expect(text).toContain('(100,0,l)')
    expect(text).toContain('(400,700,ls)')
    expect(text).not.toMatch(/\d+ \d+ LINE/)

    const reimported = buildFontDataFromGlyphsDocument(parse(text))
    const m1 = getGlyphLayer(reimported.glyphs.B, 'M1')
    expect(m1?.paths[0].nodes[0]).toMatchObject({
      x: 100,
      y: 0,
      kind: 'oncurve',
      segmentType: 'line',
    })
    expect(m1?.paths[0].nodes[2]).toMatchObject({
      kind: 'oncurve',
      smooth: true,
    })
    expect(m1?.metrics.width).toBe(520)
  })
})
