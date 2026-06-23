import { describe, expect, it } from 'vitest'
import {
  createEmptyOpenTypeFeaturesState,
  deriveOpenTypeSourceSectionRecords,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'

describe('OpenType source section record summaries', () => {
  it('resolves source record refs into display-ready summaries', () => {
    const state: OpenTypeFeaturesState = {
      ...createEmptyOpenTypeFeaturesState(),
      languagesystems: [
        {
          id: 'languagesystem_latn_dflt',
          script: 'latn',
          language: 'dflt',
        },
      ],
      features: [
        {
          id: 'feature_liga',
          tag: 'liga',
          isActive: true,
          origin: 'imported',
          entries: [
            {
              id: 'entry_liga',
              script: 'latn',
              language: 'dflt',
              lookupIds: ['lookup_liga'],
            },
          ],
        },
      ],
      lookups: [
        {
          id: 'lookup_liga',
          name: 'liga lookup',
          table: 'GSUB',
          lookupType: 'ligatureSubst',
          lookupFlag: {},
          editable: true,
          origin: 'imported',
          rules: [
            {
              id: 'rule_f_i',
              kind: 'ligatureSubstitution',
              components: ['f', 'i'],
              replacement: 'f_i',
              meta: { origin: 'imported' },
            },
          ],
        },
      ],
      glyphClasses: [
        {
          id: 'glyph_class_letters',
          name: '@Letters',
          glyphs: ['f', 'i'],
          origin: 'imported',
        },
      ],
      markClasses: [
        {
          id: 'mark_class_top',
          name: '@TOP',
          marks: [{ glyph: 'acutecomb', anchor: { x: 0, y: 500 } }],
        },
      ],
      gdef: {
        glyphClasses: {
          base: ['A'],
          mark: ['acutecomb'],
        },
        markGlyphSets: [
          {
            id: 'mark_set_top',
            name: '@TopMarks',
            glyphs: ['acutecomb'],
            origin: 'imported',
          },
        ],
        ligatureCarets: [{ glyph: 'f_i', carets: [250] }],
      },
      unsupportedLookups: [
        {
          id: 'unsupported_gsub_4',
          table: 'GSUB',
          lookupIndex: 4,
          lookupType: 6,
          subtableFormats: [3],
          reason: 'Complex contextual lookup',
          rawSummary: 'GSUB lookup 4',
          preserveMode: 'preserve-if-unchanged',
          provenance: {
            table: 'GSUB',
            lookupIndex: 4,
            lookupType: 6,
          },
        },
      ],
      diagnostics: [
        {
          id: 'feature-diagnostic-warning-gsub',
          severity: 'warning',
          message: 'FeatureVariations table is present.',
          target: { kind: 'global' },
        },
      ],
      sourceSections: [
        {
          id: 'source_compiled_gsub',
          title: 'GSUB compiled table',
          kind: 'compiled-table',
          origin: 'binary-import',
          format: 'opentype-layout-table',
          stage: 'classified',
          status: 'partially-classified',
          table: 'GSUB',
          recordRefs: [
            { kind: 'languageSystem', id: 'languagesystem_latn_dflt' },
            { kind: 'feature', id: 'feature_liga', table: 'GSUB' },
            { kind: 'lookup', id: 'lookup_liga', table: 'GSUB' },
            { kind: 'glyphClass', id: 'glyph_class_letters', table: 'GSUB' },
            { kind: 'markClass', id: 'mark_class_top', table: 'GPOS' },
            { kind: 'gdef', id: 'gdef', table: 'GDEF' },
            {
              kind: 'unsupportedLookup',
              id: 'unsupported_gsub_4',
              table: 'GSUB',
            },
            {
              kind: 'diagnostic',
              id: 'feature-diagnostic-warning-gsub',
              table: 'GSUB',
            },
            { kind: 'lookup', id: 'lookup_missing', table: 'GSUB' },
          ],
          preservationPolicy: 'preserve-if-unchanged',
        },
      ],
    }

    const [group] = deriveOpenTypeSourceSectionRecords(state)

    expect(group).toMatchObject({
      section: { id: 'source_compiled_gsub' },
      resolvedCount: 8,
      missingCount: 1,
    })
    expect(group.records.map((record) => record.label)).toEqual([
      'latn dflt',
      'liga',
      'liga lookup',
      '@Letters',
      '@TOP',
      'GDEF',
      'lookup 4',
      'warning diagnostic',
      'lookup_missing',
    ])
    expect(group.records[2]).toMatchObject({
      detail: 'GSUB ligatureSubst, 1 rules',
      status: 'resolved',
    })
    expect(group.records[5]?.detail).toContain('mark glyph sets')
    expect(group.records[8]).toMatchObject({
      status: 'missing',
      detail: 'Referenced record is missing from the current feature model.',
    })
  })
})
