import { describe, expect, it } from 'vitest'
import {
  createEmptyOpenTypeFeaturesState,
  deriveOpenTypeImportExportSummary,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'

describe('OpenType import/export summary', () => {
  it('counts imported, manual, generated, and unsupported layout state', () => {
    const state: OpenTypeFeaturesState = {
      ...createEmptyOpenTypeFeaturesState(),
      exportPolicy: 'rebuild-managed-layout-tables',
      features: [
        {
          id: 'feature_liga',
          tag: 'liga',
          isActive: true,
          entries: [
            {
              id: 'entry_liga',
              script: 'DFLT',
              language: 'dflt',
              lookupIds: ['lookup_liga_imported', 'lookup_liga_manual'],
            },
          ],
          origin: 'imported',
        },
        {
          id: 'feature_kern',
          tag: 'kern',
          isActive: true,
          entries: [
            {
              id: 'entry_kern',
              script: 'DFLT',
              language: 'dflt',
              lookupIds: ['lookup_kern_auto'],
            },
          ],
          origin: 'manual',
        },
      ],
      lookups: [
        {
          id: 'lookup_liga_imported',
          name: 'lookup_liga_imported',
          table: 'GSUB',
          lookupType: 'ligatureSubst',
          lookupFlag: {},
          editable: false,
          origin: 'imported',
          rules: [
            {
              id: 'rule_imported',
              kind: 'ligatureSubstitution',
              components: ['f', 'i'],
              replacement: 'f_i',
              meta: { origin: 'imported' },
            },
          ],
        },
        {
          id: 'lookup_liga_manual',
          name: 'lookup_liga_manual',
          table: 'GSUB',
          lookupType: 'ligatureSubst',
          lookupFlag: {},
          editable: true,
          origin: 'manual',
          rules: [
            {
              id: 'rule_manual',
              kind: 'ligatureSubstitution',
              components: ['f', 't'],
              replacement: 'f_t',
              meta: { origin: 'manual' },
            },
          ],
        },
        {
          id: 'lookup_kern_auto',
          name: 'lookup_kern_auto',
          table: 'GPOS',
          lookupType: 'pairPos',
          lookupFlag: {},
          editable: true,
          origin: 'auto',
          rules: [
            {
              id: 'rule_auto',
              kind: 'pairPositioning',
              left: { kind: 'glyph', glyph: 'A' },
              right: { kind: 'glyph', glyph: 'V' },
              firstValue: { xAdvance: -80 },
              meta: { origin: 'auto' },
            },
          ],
        },
      ],
      unsupportedLookups: [
        {
          id: 'unsupported_gsub_4',
          table: 'GSUB',
          lookupIndex: 4,
          lookupType: 6,
          subtableFormats: [3],
          preserveMode: 'preserve-if-unchanged',
          reason: 'Complex contextual lookup',
          rawSummary: 'GSUB lookup 4',
        },
      ],
      sourceSections: [
        {
          id: 'source_raw_feature_text',
          title: 'Handwritten .fea source',
          kind: 'manual-fea',
          origin: 'manual-input',
          format: 'fea',
          stage: 'source',
          status: 'raw',
          textRef: 'rawFeatureText',
          recordRefs: [],
          preservationPolicy: 'editable-rebuild',
        },
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
            { kind: 'feature', id: 'feature_liga', table: 'GSUB' },
            { kind: 'lookup', id: 'lookup_liga_imported', table: 'GSUB' },
            {
              kind: 'unsupportedLookup',
              id: 'unsupported_gsub_4',
              table: 'GSUB',
            },
          ],
          preservationPolicy: 'preserve-if-unchanged',
        },
      ],
    }

    expect(deriveOpenTypeImportExportSummary(state)).toMatchObject({
      importedFeatures: 1,
      importedLookups: 1,
      importedRules: 1,
      manualFeatures: 1,
      manualLookups: 1,
      manualRules: 1,
      generatedLookups: 1,
      generatedRules: 1,
      unsupportedLookups: 1,
      editableLookups: 2,
      preservedLookups: 1,
      sourceSections: 2,
      rawFeatureSourceSections: 1,
      compiledSourceSections: 1,
      classifiedSourceSections: 1,
      sourceRecordRefs: 3,
      exportModeLabel: 'Rebuild managed',
    })
  })
})
