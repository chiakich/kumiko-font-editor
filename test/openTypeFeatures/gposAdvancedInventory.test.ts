import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import {
  makeBytes,
  makeSfnt,
  writeTag,
  writeUint16,
} from './helpers/binaryTableFixtures'

const makeGposTable = (
  featureTag: string,
  lookupType: number,
  subtable: Uint8Array
) => {
  const tableLength = 56 + subtable.byteLength
  const bytes = makeBytes(tableLength, (view) => {
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
    writeTag(view, 32, featureTag)
    writeUint16(view, 36, 8)

    writeUint16(view, 38, 0)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)

    writeUint16(view, 48, lookupType)
    writeUint16(view, 50, 0)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 8)
  })
  bytes.set(subtable, 56)
  return bytes
}

const writeCoverageFormat1 = (
  view: DataView,
  offset: number,
  glyphIds: number[]
) => {
  writeUint16(view, offset, 1)
  writeUint16(view, offset + 2, glyphIds.length)
  glyphIds.forEach((glyphId, index) => {
    writeUint16(view, offset + 4 + index * 2, glyphId)
  })
}

const writeClassDefFormat2 = (
  view: DataView,
  offset: number,
  ranges: Array<{ startGlyphId: number; endGlyphId: number; classId: number }>
) => {
  writeUint16(view, offset, 2)
  writeUint16(view, offset + 2, ranges.length)
  ranges.forEach((range, index) => {
    const rangeOffset = offset + 4 + index * 6
    writeUint16(view, rangeOffset, range.startGlyphId)
    writeUint16(view, rangeOffset + 2, range.endGlyphId)
    writeUint16(view, rangeOffset + 4, range.classId)
  })
}

const makeClassPairPositioningSubtable = () =>
  makeBytes(52, (view) => {
    writeUint16(view, 0, 2)
    writeUint16(view, 2, 24)
    writeUint16(view, 4, 0x0004)
    writeUint16(view, 6, 0)
    writeUint16(view, 8, 32)
    writeUint16(view, 10, 42)
    writeUint16(view, 12, 2)
    writeUint16(view, 14, 2)

    writeUint16(view, 16, 0)
    writeUint16(view, 18, 0)
    writeUint16(view, 20, 0)
    writeUint16(view, 22, 0xffb0)

    writeUint16(view, 24, 1)
    writeUint16(view, 26, 2)
    writeUint16(view, 28, 1)
    writeUint16(view, 30, 2)

    writeUint16(view, 32, 1)
    writeUint16(view, 34, 1)
    writeUint16(view, 36, 2)
    writeUint16(view, 38, 1)
    writeUint16(view, 40, 1)

    writeUint16(view, 42, 1)
    writeUint16(view, 44, 3)
    writeUint16(view, 46, 2)
    writeUint16(view, 48, 1)
    writeUint16(view, 50, 1)
  })

const makeContextPositioningFormat2Subtable = () =>
  makeBytes(50, (view) => {
    writeUint16(view, 0, 2)
    writeUint16(view, 2, 26)
    writeUint16(view, 4, 34)
    writeUint16(view, 6, 2)
    writeUint16(view, 8, 0)
    writeUint16(view, 10, 12)

    writeUint16(view, 12, 1)
    writeUint16(view, 14, 4)

    writeUint16(view, 16, 2)
    writeUint16(view, 18, 1)
    writeUint16(view, 20, 2)
    writeUint16(view, 22, 1)
    writeUint16(view, 24, 0)

    writeCoverageFormat1(view, 26, [1, 2])
    writeClassDefFormat2(view, 34, [
      { startGlyphId: 1, endGlyphId: 2, classId: 1 },
      { startGlyphId: 3, endGlyphId: 4, classId: 2 },
    ])
  })

const makeChainingContextPositioningFormat2Subtable = () =>
  makeBytes(82, (view) => {
    writeUint16(view, 0, 2)
    writeUint16(view, 2, 38)
    writeUint16(view, 4, 46)
    writeUint16(view, 6, 56)
    writeUint16(view, 8, 72)
    writeUint16(view, 10, 2)
    writeUint16(view, 12, 0)
    writeUint16(view, 14, 16)

    writeUint16(view, 16, 1)
    writeUint16(view, 18, 4)

    writeUint16(view, 20, 1)
    writeUint16(view, 22, 1)
    writeUint16(view, 24, 2)
    writeUint16(view, 26, 2)
    writeUint16(view, 28, 1)
    writeUint16(view, 30, 1)
    writeUint16(view, 32, 1)
    writeUint16(view, 34, 1)
    writeUint16(view, 36, 0)

    writeCoverageFormat1(view, 38, [1, 2])
    writeClassDefFormat2(view, 46, [
      { startGlyphId: 5, endGlyphId: 6, classId: 1 },
    ])
    writeClassDefFormat2(view, 56, [
      { startGlyphId: 1, endGlyphId: 2, classId: 1 },
      { startGlyphId: 3, endGlyphId: 4, classId: 2 },
    ])
    writeClassDefFormat2(view, 72, [
      { startGlyphId: 7, endGlyphId: 8, classId: 1 },
    ])
  })

const makeMarkToBaseSubtable = () =>
  makeBytes(46, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 12)
    writeUint16(view, 4, 18)
    writeUint16(view, 6, 1)
    writeUint16(view, 8, 24)
    writeUint16(view, 10, 36)

    writeUint16(view, 12, 1)
    writeUint16(view, 14, 1)
    writeUint16(view, 16, 2)

    writeUint16(view, 18, 1)
    writeUint16(view, 20, 1)
    writeUint16(view, 22, 1)

    writeUint16(view, 24, 1)
    writeUint16(view, 26, 0)
    writeUint16(view, 28, 6)
    writeUint16(view, 30, 1)
    writeUint16(view, 32, 120)
    writeUint16(view, 34, 0)

    writeUint16(view, 36, 1)
    writeUint16(view, 38, 4)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 350)
    writeUint16(view, 44, 700)
  })

describe('advanced GPOS reconstruction', () => {
  it('extracts PairPos class-pair rules with imported glyph classes', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable('kern', 2, makeClassPairPositioningSubtable()),
        },
      ]),
      null,
      ['.notdef', 'A', 'T', 'V', 'W']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.glyphClasses).toMatchObject([
      {
        id: 'class_gpos_0_0_left_1',
        name: '@GPOS_0_0_left_1',
        glyphs: ['A', 'T'],
        origin: 'imported',
      },
      {
        id: 'class_gpos_0_0_right_1',
        name: '@GPOS_0_0_right_1',
        glyphs: ['V', 'W'],
        origin: 'imported',
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'pairPos',
        editable: true,
        rules: [
          {
            kind: 'pairPositioning',
            left: { kind: 'class', classId: 'class_gpos_0_0_left_1' },
            right: { kind: 'class', classId: 'class_gpos_0_0_right_1' },
            firstValue: { xAdvance: -80 },
          },
        ],
      },
    ])
  })

  it('extracts ContextPos class-based rules', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable(
            'kern',
            7,
            makeContextPositioningFormat2Subtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'A', 'Aacute', 'V', 'W']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.glyphClasses).toMatchObject([
      {
        id: 'class_gpos_0_0_input_0_1',
        name: '@GPOS_0_0_input_0_class_1',
        glyphs: ['A', 'Aacute'],
        origin: 'imported',
      },
      {
        id: 'class_gpos_0_0_input_1_2',
        name: '@GPOS_0_0_input_1_class_2',
        glyphs: ['V', 'W'],
        origin: 'imported',
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'contextPos',
        editable: true,
        rules: [
          {
            kind: 'contextualPositioning',
            mode: 'context',
            backtrack: [],
            input: [
              {
                selector: {
                  kind: 'class',
                  classId: 'class_gpos_0_0_input_0_1',
                },
              },
              {
                selector: {
                  kind: 'class',
                  classId: 'class_gpos_0_0_input_1_2',
                },
                lookupIds: ['lookup_gpos_0'],
              },
            ],
            lookahead: [],
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GPOS',
                lookupIndex: 0,
                lookupType: 7,
                subtableIndex: 0,
                subtableFormat: 2,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts ChainingContextPos class-based rules', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable(
            'kern',
            8,
            makeChainingContextPositioningFormat2Subtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'A', 'Aacute', 'V', 'W', 'X', 'X.alt', 'Y', 'Y.alt']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.glyphClasses).toMatchObject([
      {
        id: 'class_gpos_0_0_input_0_1',
        name: '@GPOS_0_0_input_0_class_1',
        glyphs: ['A', 'Aacute'],
        origin: 'imported',
      },
      {
        id: 'class_gpos_0_0_backtrack_0_1',
        name: '@GPOS_0_0_backtrack_0_class_1',
        glyphs: ['X', 'X.alt'],
        origin: 'imported',
      },
      {
        id: 'class_gpos_0_0_input_1_2',
        name: '@GPOS_0_0_input_1_class_2',
        glyphs: ['V', 'W'],
        origin: 'imported',
      },
      {
        id: 'class_gpos_0_0_lookahead_0_1',
        name: '@GPOS_0_0_lookahead_0_class_1',
        glyphs: ['Y', 'Y.alt'],
        origin: 'imported',
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'chainingContextPos',
        editable: true,
        rules: [
          {
            kind: 'contextualPositioning',
            mode: 'chaining',
            backtrack: [
              {
                kind: 'class',
                classId: 'class_gpos_0_0_backtrack_0_1',
              },
            ],
            input: [
              {
                selector: {
                  kind: 'class',
                  classId: 'class_gpos_0_0_input_0_1',
                },
              },
              {
                selector: {
                  kind: 'class',
                  classId: 'class_gpos_0_0_input_1_2',
                },
                lookupIds: ['lookup_gpos_0'],
              },
            ],
            lookahead: [
              {
                kind: 'class',
                classId: 'class_gpos_0_0_lookahead_0_1',
              },
            ],
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GPOS',
                lookupIndex: 0,
                lookupType: 8,
                subtableIndex: 0,
                subtableFormat: 2,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts MarkToBase rules with imported mark classes', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable('mark', 4, makeMarkToBaseSubtable()),
        },
      ]),
      null,
      ['.notdef', 'A', 'acutecomb']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.markClasses).toMatchObject([
      {
        id: 'mark_class_gpos_0_0_0',
        name: '@MC_GPOS_0_0_0',
        marks: [{ glyph: 'acutecomb', anchor: { x: 120, y: 0 } }],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'markToBasePos',
        editable: true,
        rules: [
          {
            kind: 'markToBase',
            baseGlyphs: { kind: 'glyph', glyph: 'A' },
            anchors: {
              mark_class_gpos_0_0_0: { x: 350, y: 700 },
            },
          },
        ],
      },
    ])
  })
})
