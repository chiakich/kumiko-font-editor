import { describe, expect, it } from 'vitest'
import { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import {
  makeBytes,
  makeSfnt,
  writeTag,
  writeUint16,
  writeUint32,
} from './helpers/binaryTableFixtures'
import { makeSingleSubstitutionSubtable } from './helpers/layoutTableFixtures'

const makeLookupTable = (
  tableTag: 'GSUB' | 'GPOS',
  lookupType: number,
  subtable: Uint8Array,
  withFeatureVariations = false
) => {
  const headerLength = withFeatureVariations ? 60 : 56
  const bytes = makeBytes(headerLength + subtable.byteLength, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, withFeatureVariations ? 1 : 0)
    writeUint16(view, 4, withFeatureVariations ? 14 : 10)
    writeUint16(view, 6, withFeatureVariations ? 34 : 30)
    writeUint16(view, 8, withFeatureVariations ? 48 : 44)
    if (withFeatureVariations) writeUint32(view, 10, headerLength)

    const scriptListOffset = withFeatureVariations ? 14 : 10
    const featureListOffset = withFeatureVariations ? 34 : 30
    const lookupListOffset = withFeatureVariations ? 48 : 44

    writeUint16(view, scriptListOffset, 1)
    writeTag(view, scriptListOffset + 2, 'latn')
    writeUint16(view, scriptListOffset + 6, 8)

    writeUint16(view, scriptListOffset + 8, 4)
    writeUint16(view, scriptListOffset + 10, 0)
    writeUint16(view, scriptListOffset + 12, 0)
    writeUint16(view, scriptListOffset + 14, 0xffff)
    writeUint16(view, scriptListOffset + 16, 1)
    writeUint16(view, scriptListOffset + 18, 0)

    writeUint16(view, featureListOffset, 1)
    writeTag(view, featureListOffset + 2, tableTag === 'GSUB' ? 'liga' : 'kern')
    writeUint16(view, featureListOffset + 6, 8)
    writeUint16(view, featureListOffset + 8, 0)
    writeUint16(view, featureListOffset + 10, 1)
    writeUint16(view, featureListOffset + 12, 0)

    writeUint16(view, lookupListOffset, 1)
    writeUint16(view, lookupListOffset + 2, 4)
    writeUint16(view, lookupListOffset + 4, lookupType)
    writeUint16(view, lookupListOffset + 6, 0)
    writeUint16(view, lookupListOffset + 8, 1)
    writeUint16(view, lookupListOffset + 10, 8)
  })
  bytes.set(subtable, headerLength)
  return bytes
}

const makeUnsupportedSubtable = () =>
  makeBytes(2, (view) => {
    writeUint16(view, 0, 99)
  })

const makeGdefTable = ({
  caretFormat = 1,
  caretValue = 300,
}: {
  caretFormat?: number
  caretValue?: number
} = {}) =>
  makeBytes(72, (view) => {
    writeUint16(view, 0, 1)
    writeUint16(view, 2, 2)
    writeUint16(view, 4, 14)
    writeUint16(view, 6, 0)
    writeUint16(view, 8, 28)
    writeUint16(view, 10, 64)
    writeUint16(view, 12, 50)

    writeUint16(view, 14, 1)
    writeUint16(view, 16, 1)
    writeUint16(view, 18, 4)
    writeUint16(view, 20, 1)
    writeUint16(view, 22, 2)
    writeUint16(view, 24, 3)
    writeUint16(view, 26, 4)

    writeUint16(view, 28, 8)
    writeUint16(view, 30, 1)
    writeUint16(view, 32, 14)
    writeUint16(view, 36, 1)
    writeUint16(view, 38, 1)
    writeUint16(view, 40, 2)
    writeUint16(view, 42, 1)
    writeUint16(view, 44, 4)
    writeUint16(view, 46, caretFormat)
    writeUint16(view, 48, caretValue)

    writeUint16(view, 50, 1)
    writeUint16(view, 52, 1)
    writeUint32(view, 54, 8)
    writeUint16(view, 58, 1)
    writeUint16(view, 60, 1)
    writeUint16(view, 62, 3)

    writeUint16(view, 64, 1)
    writeUint16(view, 66, 3)
    writeUint16(view, 68, 1)
    writeUint16(view, 70, 1)
  })

const makeFlaggedLookupTable = (
  lookupType: number,
  lookupFlag: number,
  markFilteringSet: number,
  subtable: Uint8Array
) => {
  const headerLength = 58
  const bytes = makeBytes(headerLength + subtable.byteLength, (view) => {
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
    writeUint16(view, 48, lookupType)
    writeUint16(view, 50, lookupFlag)
    writeUint16(view, 52, 1)
    writeUint16(view, 54, 10)
    writeUint16(view, 56, markFilteringSet)
  })
  bytes.set(subtable, headerLength)
  return bytes
}

describe('GDEF and variation inventory', () => {
  it('imports straightforward GDEF glyph classes, mark glyph sets, and ligature carets', () => {
    const state = extractBinaryFeatures(
      makeSfnt([{ tag: 'GDEF', data: makeGdefTable() }]),
      null,
      ['.notdef', 'A', 'f_i', 'acutecomb', 'componentGlyph']
    )

    expect(state.gdef).toEqual({
      glyphClasses: {
        base: ['A'],
        ligature: ['f_i'],
        mark: ['acutecomb'],
        component: ['componentGlyph'],
      },
      markGlyphSets: [
        {
          id: 'gdef_mark_glyph_set_0',
          name: '@GDEFMarkGlyphSet0',
          glyphs: ['acutecomb'],
          origin: 'imported',
        },
      ],
      markAttachClasses: [
        {
          id: 'gdef_mark_attach_class_1',
          name: '@GDEFMarkAttachClass1',
          glyphs: ['acutecomb'],
          origin: 'imported',
        },
      ],
      ligatureCarets: [{ glyph: 'f_i', carets: [300] }],
    })
    expect(state.sourceSections).toMatchObject([
      {
        id: 'source_compiled_gdef',
        kind: 'compiled-table',
        origin: 'binary-import',
        format: 'opentype-layout-table',
        stage: 'classified',
        status: 'classified',
        table: 'GDEF',
        preservationPolicy: 'editable-rebuild',
        recordRefs: [{ kind: 'gdef', id: 'gdef', table: 'GDEF' }],
      },
    ])
    expect(state.diagnostics ?? []).toEqual([])
  })

  it('imports point-index GDEF ligature carets', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        { tag: 'GDEF', data: makeGdefTable({ caretFormat: 2, caretValue: 7 }) },
      ]),
      null,
      ['.notdef', 'A', 'f_i', 'acutecomb', 'componentGlyph']
    )

    expect(state.gdef?.ligatureCarets).toEqual([
      { glyph: 'f_i', carets: [7], format: 'pointIndex' },
    ])
    expect(generateFea(state).text).toContain('LigatureCaretByIndex f_i 7;')
    expect(state.diagnostics ?? []).toEqual([])
  })

  it('resolves MarkAttachmentType and UseMarkFilteringSet lookup flags against GDEF classes', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        { tag: 'GDEF', data: makeGdefTable() },
        {
          tag: 'GSUB',
          data: makeFlaggedLookupTable(
            1,
            0x0110,
            0,
            makeSingleSubstitutionSubtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'A', 'f_i', 'acutecomb', 'componentGlyph']
    )

    const lookup = state.lookups[0]
    expect(lookup.lookupFlag).toMatchObject({
      useMarkFilteringSet: true,
      markAttachmentType: true,
    })
    expect(lookup.markAttachmentClassId).toBe('gdef_mark_attach_class_1')
    expect(lookup.markFilteringSetClassId).toBe('gdef_mark_glyph_set_0')
    expect(state.diagnostics ?? []).toEqual([])

    const generated = generateFea(state).text
    expect(generated).toContain('@GDEFMarkGlyphSet0 = [acutecomb];')
    expect(generated).toContain('@GDEFMarkAttachClass1 = [acutecomb];')
    expect(generated).toContain(
      'lookupflag MarkAttachmentType @GDEFMarkAttachClass1 UseMarkFilteringSet @GDEFMarkGlyphSet0;'
    )
    expect(generated).not.toMatch(/^\s*MarkGlyphSetsDef/m)
  })

  it('warns when lookup flags reference GDEF classes that were not imported', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeFlaggedLookupTable(
            1,
            0x0210,
            1,
            makeSingleSubstitutionSubtable()
          ),
        },
      ]),
      null,
      ['.notdef', 'A', 'f_i']
    )

    const diagnosticIds = (state.diagnostics ?? []).map(
      (diagnostic) => diagnostic.id
    )
    expect(diagnosticIds).toContain(
      'feature-diagnostic-warning-GSUB-lookup-0-missing-mark-attach-class'
    )
    expect(diagnosticIds).toContain(
      'feature-diagnostic-warning-GSUB-lookup-0-missing-mark-filtering-set'
    )

    const generated = generateFea(state).text
    expect(generated).toContain(
      'Cannot serialize MarkAttachmentType for lookup lookup_gsub_0'
    )
    expect(generated).toContain(
      'Cannot serialize UseMarkFilteringSet for lookup lookup_gsub_0'
    )
  })

  it('reports GSUB and GPOS FeatureVariations as explicit unsupported table-level data', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeLookupTable('GSUB', 5, makeUnsupportedSubtable(), true),
        },
        {
          tag: 'GPOS',
          data: makeLookupTable('GPOS', 7, makeUnsupportedSubtable(), true),
        },
      ]),
      null,
      ['.notdef']
    )

    expect(
      (state.diagnostics ?? []).map((diagnostic) => diagnostic.id)
    ).toContain(
      'feature-diagnostic-warning-binary-extractor-gsub-feature-variations-present'
    )
    expect(
      (state.diagnostics ?? []).map((diagnostic) => diagnostic.id)
    ).toContain(
      'feature-diagnostic-warning-binary-extractor-gpos-feature-variations-present'
    )
  })

  it('marks FeatureVariations tables as preserve-if-unchanged even when lookups are editable', () => {
    const state = extractBinaryFeatures(
      makeSfnt([
        {
          tag: 'GSUB',
          data: makeLookupTable(
            'GSUB',
            1,
            makeSingleSubstitutionSubtable(),
            true
          ),
        },
      ]),
      null,
      ['.notdef', 'b', 'b.salt']
    )

    expect(state.unsupportedLookups).toEqual([])
    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_compiled_gsub',
      status: 'partially-classified',
      preservationPolicy: 'preserve-if-unchanged',
      meta: {
        featureVariationsPresent: true,
        featureVariationsOffset: 60,
        unreconstructedTableData: ['FeatureVariations'],
      },
      recordRefs: expect.arrayContaining([
        {
          kind: 'diagnostic',
          id: 'feature-diagnostic-warning-binary-extractor-gsub-feature-variations-present',
          table: 'GSUB',
        },
      ]),
    })
  })

  it('keeps every GSUB and GPOS lookup type either editable or explicitly unsupported', () => {
    const cases = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((lookupType) => ({
        table: 'GSUB' as const,
        data: makeLookupTable('GSUB', lookupType, makeUnsupportedSubtable()),
        lookupType,
      })),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lookupType) => ({
        table: 'GPOS' as const,
        data: makeLookupTable('GPOS', lookupType, makeUnsupportedSubtable()),
        lookupType,
      })),
    ]

    for (const testCase of cases) {
      const state = extractBinaryFeatures(
        makeSfnt([{ tag: testCase.table, data: testCase.data }]),
        null,
        ['.notdef']
      )
      const lookup = state.lookups[0]
      const unsupportedLookup = state.unsupportedLookups.find(
        (item) => item.lookupIndex === 0 && item.table === testCase.table
      )

      expect(
        lookup,
        `${testCase.table} lookup type ${testCase.lookupType}`
      ).toBeDefined()
      expect(
        lookup.editable || unsupportedLookup !== undefined,
        `${testCase.table} lookup type ${testCase.lookupType}`
      ).toBe(true)
    }
  })
})
