import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import { readSfntTableDirectory } from 'src/lib/openTypeFeatures/binaryReader'
import { parseLayoutTableInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'

interface TableFixture {
  tag: string
  data: Uint8Array
}

const TRUE_TYPE_SCALER = [0x00, 0x01, 0x00, 0x00]

const align4 = (value: number) => Math.ceil(value / 4) * 4

const writeTag = (view: DataView, offset: number, tag: string) => {
  for (let index = 0; index < 4; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index))
  }
}

const writeUint16 = (view: DataView, offset: number, value: number) => {
  view.setUint16(offset, value, false)
}

const writeUint32 = (view: DataView, offset: number, value: number) => {
  view.setUint32(offset, value, false)
}

const makeBytes = (length: number, write: (view: DataView) => void) => {
  const bytes = new Uint8Array(length)
  write(new DataView(bytes.buffer))
  return bytes
}

const makeSfnt = (tables: TableFixture[]) => {
  const directoryLength = 12 + tables.length * 16
  const tableOffsets: number[] = []
  let cursor = align4(directoryLength)

  for (const table of tables) {
    tableOffsets.push(cursor)
    cursor = align4(cursor + table.data.byteLength)
  }

  const bytes = new Uint8Array(cursor)
  const view = new DataView(bytes.buffer)
  TRUE_TYPE_SCALER.forEach((byte, index) => view.setUint8(index, byte))
  writeUint16(view, 4, tables.length)

  tables.forEach((table, index) => {
    const recordOffset = 12 + index * 16
    writeTag(view, recordOffset, table.tag)
    writeUint32(view, recordOffset + 4, 0)
    writeUint32(view, recordOffset + 8, tableOffsets[index])
    writeUint32(view, recordOffset + 12, table.data.byteLength)
    bytes.set(table.data, tableOffsets[index])
  })

  return bytes.buffer
}

const makeMinimalGsubTable = () =>
  makeBytes(58, (view) => {
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
    writeTag(view, 32, 'liga')
    writeUint16(view, 36, 8)

    writeUint16(view, 38, 0)
    writeUint16(view, 40, 1)
    writeUint16(view, 42, 0)

    writeUint16(view, 44, 1)
    writeUint16(view, 46, 4)

    writeUint16(view, 48, 6)
    writeUint16(view, 50, 0x0008)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 8)
    writeUint16(view, 56, 3)
  })

const makeGsubTable = (
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

const makeSingleSubstitutionSubtable = () =>
  makeBytes(14, (view) => {
    writeUint16(view, 0, 2)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 2)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)
  })

const makeMultipleSubstitutionSubtable = () =>
  makeBytes(22, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 14)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)

    writeUint16(view, 14, 3)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 3)
    writeUint16(view, 20, 4)
  })

const makeAlternateSubstitutionSubtable = () =>
  makeBytes(20, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 14)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)

    writeUint16(view, 14, 2)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 3)
  })

const makeLigatureSubstitutionSubtable = () =>
  makeBytes(24, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 14)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)

    writeUint16(view, 14, 1)
    writeUint16(view, 16, 4)

    writeUint16(view, 18, 3)
    writeUint16(view, 20, 2)
    writeUint16(view, 22, 2)
  })

const makeExtensionSingleSubstitutionSubtable = () => {
  const innerSubtable = makeSingleSubstitutionSubtable()
  const bytes = makeBytes(8 + innerSubtable.byteLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 1)
    writeUint32(view, 4, 8)
  })
  bytes.set(innerSubtable, 8)
  return bytes
}

const makeContextSubstitutionSubtable = () =>
  makeBytes(28, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 22)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 8)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 4)

    writeUint16(view, 12, 2)
    writeUint16(view, 14, 1)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 1)
    writeUint16(view, 20, 0)

    writeUint16(view, 22, 1)
    writeUint16(view, 24, 1)
    writeUint16(view, 26, 1)
  })

const makeChainingContextSubstitutionSubtable = () =>
  makeBytes(36, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 30)
    writeUint16(view, 4, 1)
    writeUint16(view, 6, 8)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 4)

    writeUint16(view, 12, 1)
    writeUint16(view, 14, 3)
    writeUint16(view, 16, 2)
    writeUint16(view, 18, 2)
    writeUint16(view, 20, 1)
    writeUint16(view, 22, 4)
    writeUint16(view, 24, 1)
    writeUint16(view, 26, 1)
    writeUint16(view, 28, 0)

    writeUint16(view, 30, 1)
    writeUint16(view, 32, 1)
    writeUint16(view, 34, 1)
  })

const makeSinglePositioningSubtable = () =>
  makeBytes(14, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 8)
    writeUint16(view, 4, 0x0004)
    writeUint16(view, 6, 0xffce)

    writeUint16(view, 8, 1)
    writeUint16(view, 10, 1)
    writeUint16(view, 12, 1)
  })

const makePairPositioningSubtable = () =>
  makeBytes(26, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 14)
    writeUint16(view, 4, 0x0004)
    writeUint16(view, 6, 0)
    writeUint16(view, 8, 1)
    writeUint16(view, 10, 20)

    writeUint16(view, 14, 1)
    writeUint16(view, 16, 1)
    writeUint16(view, 18, 1)

    writeUint16(view, 20, 1)
    writeUint16(view, 22, 2)
    writeUint16(view, 24, 0xffb0)
  })

const makeDummyTable = (length = 4) => new Uint8Array(length)

describe('SFNT binary inventory', () => {
  it('reads table tags from the SFNT directory', () => {
    const buffer = makeSfnt([
      { tag: 'head', data: makeDummyTable() },
      { tag: 'GSUB', data: makeMinimalGsubTable() },
      { tag: 'kern', data: makeDummyTable() },
    ])

    const directory = readSfntTableDirectory(buffer)

    expect(directory.scalerType).toBe('TrueType')
    expect(directory.diagnostics).toEqual([])
    expect(directory.tables.map((table) => table.tag)).toEqual([
      'head',
      'GSUB',
      'kern',
    ])
  })

  it('handles fonts without GSUB or GPOS layout tables gracefully', () => {
    const state = extractBinaryFeatures(
      makeSfnt([{ tag: 'head', data: makeDummyTable() }]),
      null
    )

    expect(state.features).toEqual([])
    expect(state.lookups).toEqual([])
    expect(state.unsupportedLookups).toEqual([])
    expect(state.diagnostics).toEqual([])
  })

  it('inventories a minimal GSUB ScriptList, FeatureList, and LookupList', () => {
    const buffer = makeSfnt([{ tag: 'GSUB', data: makeMinimalGsubTable() }])
    const directory = readSfntTableDirectory(buffer)
    const gsubRecord = directory.tables.find((table) => table.tag === 'GSUB')

    expect(gsubRecord).toBeDefined()
    const inventory = parseLayoutTableInventory(buffer, {
      ...gsubRecord!,
      tag: 'GSUB',
    })

    expect(inventory.languages).toEqual([
      { script: 'latn', language: 'dflt', featureIndices: [0] },
    ])
    expect(inventory.features).toEqual([
      { tag: 'liga', featureIndex: 0, lookupIndices: [0] },
    ])
    expect(inventory.lookups).toEqual([
      {
        lookupIndex: 0,
        lookupType: 6,
        lookupFlag: 0x0008,
        subtableFormats: [3],
        subtableOffsets: [56],
      },
    ])
    expect(inventory.diagnostics).toEqual([])
  })

  it('creates readonly lookup and unsupported records for imported GSUB lookups', () => {
    const state = extractBinaryFeatures(
      makeSfnt([{ tag: 'GSUB', data: makeMinimalGsubTable() }]),
      null
    )

    expect(state.languagesystems).toEqual([
      { id: 'languagesystem_DFLT_dflt', script: 'DFLT', language: 'dflt' },
      { id: 'languagesystem_latn_dflt', script: 'latn', language: 'dflt' },
    ])
    expect(state.features).toMatchObject([
      {
        tag: 'liga',
        origin: 'imported',
        entries: [
          {
            script: 'latn',
            language: 'dflt',
            lookupIds: ['lookup_gsub_0'],
          },
        ],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        table: 'GSUB',
        lookupType: 'chainingContextSubst',
        lookupFlag: { ignoreMarks: true },
        editable: false,
        origin: 'unsupported',
      },
    ])
    expect(state.unsupportedLookups).toMatchObject([
      {
        id: 'unsupported_gsub_0',
        table: 'GSUB',
        lookupIndex: 0,
        lookupType: 6,
        subtableFormats: [3],
        preserveMode: 'preserve-if-unchanged',
      },
    ])
  })

  it('extracts editable GSUB SingleSubst rules from straightforward subtables', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable('salt', 1, makeSingleSubstitutionSubtable()),
        },
      ]),
      null,
      ['.notdef', 'b', 'b.salt']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'singleSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'b' },
            replacement: 'b.salt',
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 1,
                subtableIndex: 0,
                subtableFormat: 2,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GSUB MultipleSubst rules from straightforward subtables', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable('frac', 2, makeMultipleSubstitutionSubtable()),
        },
      ]),
      null,
      ['.notdef', 'onehalf', 'one', 'slash', 'two']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'multipleSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'multipleSubstitution',
            target: 'onehalf',
            replacement: ['one', 'slash', 'two'],
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 2,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GSUB AlternateSubst rules from straightforward subtables', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable('salt', 3, makeAlternateSubstitutionSubtable()),
        },
      ]),
      null,
      ['.notdef', 'a', 'a.salt', 'a.swash']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'alternateSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'alternateSubstitution',
            target: 'a',
            alternates: ['a.salt', 'a.swash'],
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 3,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GSUB LigatureSubst rules from straightforward subtables', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable('liga', 4, makeLigatureSubstitutionSubtable()),
        },
      ]),
      null,
      ['.notdef', 'f', 'i', 'f_i']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'ligatureSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'ligatureSubstitution',
            components: ['f', 'i'],
            replacement: 'f_i',
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 4,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GSUB rules through ExtensionSubst wrappers', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable(
            'salt',
            7,
            makeExtensionSingleSubstitutionSubtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'b', 'b.salt']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'extensionSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'b' },
            replacement: 'b.salt',
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 7,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GSUB ContextSubst glyph sequence rules', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable('calt', 5, makeContextSubstitutionSubtable()),
        },
      ]),
      null,
      ['.notdef', 'A', 'B']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'contextSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'contextualSubstitution',
            mode: 'context',
            backtrack: [],
            input: [
              { selector: { kind: 'glyph', glyph: 'A' } },
              {
                selector: { kind: 'glyph', glyph: 'B' },
                lookupIds: ['lookup_gsub_0'],
              },
            ],
            lookahead: [],
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 5,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GSUB ChainingContextSubst glyph sequence rules', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable(
            'calt',
            6,
            makeChainingContextSubstitutionSubtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'A', 'B', 'X', 'Y']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gsub_0',
        lookupType: 'chainingContextSubst',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'contextualSubstitution',
            mode: 'chaining',
            backtrack: [{ kind: 'glyph', glyph: 'X' }],
            input: [
              { selector: { kind: 'glyph', glyph: 'A' } },
              {
                selector: { kind: 'glyph', glyph: 'B' },
                lookupIds: ['lookup_gsub_0'],
              },
            ],
            lookahead: [{ kind: 'glyph', glyph: 'Y' }],
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GSUB',
                lookupIndex: 0,
                lookupType: 6,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GPOS SinglePos rules from straightforward subtables', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable('mark', 1, makeSinglePositioningSubtable()),
        },
      ]),
      null,
      ['.notdef', 'acutecomb']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'singlePos',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'singlePositioning',
            target: { kind: 'glyph', glyph: 'acutecomb' },
            value: { xAdvance: -50 },
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GPOS',
                lookupIndex: 0,
                lookupType: 1,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('extracts editable GPOS PairPos glyph-pair rules from straightforward subtables', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable('kern', 2, makePairPositioningSubtable()),
        },
      ]),
      null,
      ['.notdef', 'A', 'V']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'pairPos',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'pairPositioning',
            left: { kind: 'glyph', glyph: 'A' },
            right: { kind: 'glyph', glyph: 'V' },
            firstValue: { xAdvance: -80 },
            meta: {
              origin: 'imported',
              provenance: {
                table: 'GPOS',
                lookupIndex: 0,
                lookupType: 2,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('detects GDEF and legacy kern table presence distinctly', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        { tag: 'GDEF', data: makeDummyTable() },
        { tag: 'kern', data: makeDummyTable() },
      ]),
      null
    )

    expect(state.gdef).toEqual({})
    expect(state.unsupportedLookups).toEqual([])
    expect(
      (state.diagnostics ?? []).map((diagnostic) => diagnostic.id)
    ).toEqual([
      'feature-diagnostic-info-binary-extractor-gdef-present',
      'feature-diagnostic-warning-binary-extractor-legacy-kern-present',
    ])
  })
})
