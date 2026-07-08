import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'
import { getRawFeatureText } from 'src/lib/openTypeFeatures/rawFeatureSnippets'
import {
  makeBytes,
  makeSfnt,
  writeTag,
  writeUint16,
} from './helpers/binaryTableFixtures'
import { makeSingleSubstitutionSubtable } from './helpers/layoutTableFixtures'

const GLYPH_ORDER = ['.notdef', 'a', 'a.ss01']

const utf16Be = (text: string) => {
  const bytes = new Uint8Array(text.length * 2)
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    bytes[index * 2] = code >> 8
    bytes[index * 2 + 1] = code & 0xff
  }
  return bytes
}

const makeNameTable = (entries: Array<{ nameId: number; text: string }>) => {
  const encoded = entries.map((entry) => utf16Be(entry.text))
  const stringOffset = 6 + entries.length * 12
  const totalStringLength = encoded.reduce((sum, item) => sum + item.length, 0)
  const bytes = new Uint8Array(stringOffset + totalStringLength)
  const view = new DataView(bytes.buffer)
  writeUint16(view, 0, 0)
  writeUint16(view, 2, entries.length)
  writeUint16(view, 4, stringOffset)

  let cursor = 0
  entries.forEach((entry, index) => {
    const recordOffset = 6 + index * 12
    writeUint16(view, recordOffset, 3)
    writeUint16(view, recordOffset + 2, 1)
    writeUint16(view, recordOffset + 4, 0x409)
    writeUint16(view, recordOffset + 6, entry.nameId)
    writeUint16(view, recordOffset + 8, encoded[index].length)
    writeUint16(view, recordOffset + 10, cursor)
    bytes.set(encoded[index], stringOffset + cursor)
    cursor += encoded[index].length
  })
  return bytes
}

const makeGsubWithFeatureParams = (tag: string, paramsBytes: Uint8Array) => {
  const subtable = makeSingleSubstitutionSubtable()
  const paramsStart = 56 + subtable.byteLength
  const bytes = makeBytes(paramsStart + paramsBytes.byteLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 0)
    writeUint16(view, 4, 10)
    writeUint16(view, 6, 30)
    writeUint16(view, 8, 44)

    writeUint16(view, 10, 1)
    writeTag(view, 12, 'latn')
    writeUint16(view, 16, 8)
    writeUint16(view, 18, 4)
    writeUint16(view, 20, 0)
    writeUint16(view, 22, 0)
    writeUint16(view, 24, 0xffff)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeTag(view, 32, tag)
    writeUint16(view, 36, 8)
    writeUint16(view, 38, paramsStart - 38)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)
    writeUint16(view, 48, 1)
    writeUint16(view, 50, 0)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 8)
  })
  bytes.set(subtable, 56)
  bytes.set(paramsBytes, paramsStart)
  return bytes
}

describe('OpenType feature params', () => {
  it('imports stylistic set UI names from binary FeatureParams and the name table', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubWithFeatureParams(
            'ss01',
            makeBytes(4, (view) => {
              writeUint16(view, 0, 0)
              writeUint16(view, 2, 256)
            })
          ),
        },
        {
          tag: 'name',
          data: makeNameTable([{ nameId: 256, text: 'Single storey a' }]),
        },
      ]),
      null,
      GLYPH_ORDER
    )

    expect(state.features[0].featureParams).toEqual({
      kind: 'stylisticSet',
      names: [{ text: 'Single storey a', nameId: 256 }],
    })
    expect(state.diagnostics ?? []).toEqual([])

    const generated = generateFea(state).text
    expect(generated).toContain('featureNames {')
    expect(generated).toContain('name "Single storey a";')
  })

  it('warns when FeatureParams references a missing name table entry', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubWithFeatureParams(
            'ss01',
            makeBytes(4, (view) => {
              writeUint16(view, 0, 0)
              writeUint16(view, 2, 256)
            })
          ),
        },
      ]),
      null,
      GLYPH_ORDER
    )

    expect(state.features[0].featureParams).toEqual({
      kind: 'stylisticSet',
      names: [],
    })
    expect((state.diagnostics ?? []).map((d) => d.id)).toContain(
      'feature-diagnostic-warning-binary-extractor-GSUB-feature-0-missing-name-256'
    )
  })

  it('imports character variant params with characters and named parameters', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubWithFeatureParams(
            'cv01',
            makeBytes(20, (view) => {
              writeUint16(view, 0, 0)
              writeUint16(view, 2, 257)
              writeUint16(view, 4, 0)
              writeUint16(view, 6, 258)
              writeUint16(view, 8, 1)
              writeUint16(view, 10, 259)
              writeUint16(view, 12, 2)
              view.setUint8(14, 0)
              writeUint16(view, 15, 0x61)
              view.setUint8(17, 0x01)
              writeUint16(view, 18, 0xf600)
            })
          ),
        },
        {
          tag: 'name',
          data: makeNameTable([
            { nameId: 257, text: 'Variant a' },
            { nameId: 258, text: 'abc' },
            { nameId: 259, text: 'Rounded' },
          ]),
        },
      ]),
      null,
      GLYPH_ORDER
    )

    expect(state.features[0].featureParams).toEqual({
      kind: 'characterVariant',
      featUiLabelNames: [{ text: 'Variant a', nameId: 257 }],
      featUiTooltipTextNames: [],
      sampleTextNames: [{ text: 'abc', nameId: 258 }],
      paramUiLabelNames: [{ text: 'Rounded', nameId: 259 }],
      characters: [0x61, 0x1f600],
    })

    const generated = generateFea(state).text
    expect(generated).toContain('cvParameters {')
    expect(generated).toContain('FeatUILabelNameID {')
    expect(generated).toContain('name "Variant a";')
    expect(generated).toContain('SampleTextNameID {')
    expect(generated).toContain('ParamUILabelNameID {')
    expect(generated).toContain('Character 0x0061;')
    expect(generated).toContain('Character 0x1F600;')
  })

  it('classifies featureNames blocks in raw stylistic set features', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature ss01 {',
          '  featureNames {',
          '    name "Alternate a";',
          '  };',
          '  sub a by a.ss01;',
          '} ss01;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      stage: 'classified',
      status: 'classified',
    })
    const feature = state.features.find((item) => item.tag === 'ss01')
    expect(feature?.featureParams).toEqual({
      kind: 'stylisticSet',
      names: [{ text: 'Alternate a' }],
    })

    const generated = generateFea(state).text
    expect(generated).toContain('featureNames {')
    expect(generated).toContain('name "Alternate a";')
  })

  it('classifies cvParameters blocks in raw character variant features', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature cv01 {',
          '  cvParameters {',
          '    FeatUILabelNameID {',
          '      name "Variant a";',
          '    };',
          '    ParamUILabelNameID {',
          '      name "Rounded";',
          '    };',
          '    Character 0x61;',
          '    Character 98;',
          '  };',
          '  sub a by a.ss01;',
          '} cv01;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      stage: 'classified',
      status: 'classified',
    })
    const feature = state.features.find((item) => item.tag === 'cv01')
    expect(feature?.featureParams).toEqual({
      kind: 'characterVariant',
      featUiLabelNames: [{ text: 'Variant a' }],
      featUiTooltipTextNames: [],
      sampleTextNames: [],
      paramUiLabelNames: [{ text: 'Rounded' }],
      characters: [0x61, 98],
    })
  })

  it('classifies size feature parameters and sizemenuname', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature size {',
          '  parameters 10.0 3 8.0 12.0;',
          '  sizemenuname "Ten";',
          '} size;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      stage: 'classified',
      status: 'classified',
    })
    const feature = state.features.find((item) => item.tag === 'size')
    expect(feature?.featureParams).toEqual({
      kind: 'size',
      designSize: 100,
      subfamilyIdentifier: 3,
      subfamilyNames: [{ text: 'Ten' }],
      rangeStart: 80,
      rangeEnd: 120,
    })

    const generated = generateFea(state).text
    expect(generated).toContain('parameters 10.0 3 8.0 12.0;')
    expect(generated).toContain('sizemenuname "Ten";')
  })

  it('keeps name statements with explicit platform IDs as unsupported raw source', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature ss01 {',
          '  featureNames {',
          '    name 3 1 0x409 "Alternate a";',
          '  };',
          '  sub a by a.ss01;',
          '} ss01;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      stage: 'source',
      status: 'raw',
    })
    expect(getRawFeatureText(state)).toContain('name 3 1 0x409 "Alternate a";')
  })
})
