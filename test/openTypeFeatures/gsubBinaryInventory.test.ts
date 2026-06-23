import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import {
  makeAlternateSubstitutionSubtable,
  makeChainingContextSubstitutionFormat3Subtable,
  makeChainingContextSubstitutionSubtable,
  makeContextSubstitutionSubtable,
  makeExtensionSingleSubstitutionSubtable,
  makeGsubTable,
  makeLigatureSubstitutionSubtable,
  makeMinimalGsubTable,
  makeMultipleSubstitutionSubtable,
  makeSfnt,
  makeSingleSubstitutionSubtable,
} from './helpers/layoutTableFixtures'

describe('GSUB binary inventory', () => {
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
    expect(state.sourceSections).toMatchObject([
      {
        id: 'source_compiled_gsub',
        kind: 'compiled-table',
        origin: 'binary-import',
        format: 'opentype-layout-table',
        stage: 'classified',
        status: 'inventoried',
        table: 'GSUB',
        preservationPolicy: 'preserve-if-unchanged',
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'feature', id: state.features[0]?.id, table: 'GSUB' },
        { kind: 'lookup', id: 'lookup_gsub_0', table: 'GSUB' },
        { kind: 'unsupportedLookup', id: 'unsupported_gsub_0', table: 'GSUB' },
      ])
    )
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

  it('extracts editable GSUB ChainingContextSubst format 3 coverage rules', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeGsubTable(
            'calt',
            6,
            makeChainingContextSubstitutionFormat3Subtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'A', 'B', 'X', 'Y', 'Z', 'C']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.glyphClasses).toMatchObject([
      {
        id: 'class_gsub_0_0_backtrack_0_0',
        name: '@GSUB_0_0_backtrack_0',
        glyphs: ['X', 'Z'],
        origin: 'imported',
      },
      {
        id: 'class_gsub_0_0_input_1_0',
        name: '@GSUB_0_0_input_1',
        glyphs: ['B', 'C'],
        origin: 'imported',
      },
    ])
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
            backtrack: [
              { kind: 'class', classId: 'class_gsub_0_0_backtrack_0_0' },
            ],
            input: [
              { selector: { kind: 'glyph', glyph: 'A' } },
              {
                selector: {
                  kind: 'class',
                  classId: 'class_gsub_0_0_input_1_0',
                },
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
                subtableFormat: 3,
              },
            },
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        {
          kind: 'glyphClass',
          id: 'class_gsub_0_0_backtrack_0_0',
          table: 'GSUB',
        },
        {
          kind: 'glyphClass',
          id: 'class_gsub_0_0_input_1_0',
          table: 'GSUB',
        },
      ])
    )
  })
})
