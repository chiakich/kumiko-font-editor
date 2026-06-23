import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import {
  makeExtensionSinglePositioningSubtable,
  makeGposTable,
  makeGposTableWithSubtables,
  makePairPositioningSubtable,
  makeSfnt,
  makeSinglePositioningSubtable,
  makeUnsupportedPositioningSubtable,
} from './helpers/layoutTableFixtures'

describe('GPOS binary inventory', () => {
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

  it('extracts editable GPOS rules through ExtensionPos wrappers', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTable(
            'mark',
            9,
            makeExtensionSinglePositioningSubtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'acutecomb']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'extensionPos',
        editable: true,
        origin: 'imported',
        rules: [
          {
            kind: 'singlePositioning',
            target: { kind: 'glyph', glyph: 'acutecomb' },
            value: { xAdvance: -50 },
            meta: {
              origin: 'imported',
              reason: 'Reconstructed from a GPOS ExtensionPos wrapper.',
              provenance: {
                table: 'GPOS',
                lookupIndex: 0,
                lookupType: 9,
                subtableIndex: 0,
                subtableFormat: 1,
              },
            },
          },
        ],
      },
    ])
  })

  it('preserves partially reconstructed GPOS lookups as unsupported', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GPOS',
          data: makeGposTableWithSubtables('mark', 1, [
            makeSinglePositioningSubtable(),
            makeUnsupportedPositioningSubtable(),
          ]),
        },
      ]),
      null,
      ['.notdef', 'acutecomb']
    )

    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_gpos_0',
        lookupType: 'singlePos',
        editable: false,
        origin: 'unsupported',
        rules: [],
      },
    ])
    expect(state.unsupportedLookups).toMatchObject([
      {
        id: 'unsupported_gpos_0',
        table: 'GPOS',
        lookupIndex: 0,
        lookupType: 1,
        subtableFormats: [1, 3],
        reason:
          'One or more GPOS subtables could not be reconstructed as editable rules.',
        preserveMode: 'preserve-if-unchanged',
      },
    ])
    expect(state.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'feature-diagnostic-warning-gpos-parser-lookup-0-subtable-1-unsupported',
          severity: 'warning',
          target: { kind: 'lookup', lookupId: 'lookup_gpos_0' },
        }),
      ])
    )
    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_compiled_gpos',
      status: 'inventoried',
      preservationPolicy: 'preserve-if-unchanged',
    })
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'lookup', id: 'lookup_gpos_0', table: 'GPOS' },
        { kind: 'unsupportedLookup', id: 'unsupported_gpos_0', table: 'GPOS' },
        {
          kind: 'diagnostic',
          id: 'feature-diagnostic-warning-gpos-parser-lookup-0-subtable-1-unsupported',
          table: 'GPOS',
        },
      ])
    )
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
})
