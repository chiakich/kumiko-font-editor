import { describe, expect, it } from 'vitest'
import { createCompilerRuntimeStatus } from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import {
  deriveOpenTypeExportImpactItems,
  deriveOpenTypeExportWarnings,
  needsOpenTypeFeatureCompilationForBinaryExport,
  requiresDropUnsupportedConfirmation,
} from 'src/lib/openTypeFeatures/exportPolicy'
import { makeStateWithRule } from './openTypeFeatureTestHelpers'

describe('OpenType binary export compiler gate', () => {
  it('requires compiler runtime for managed binary feature edits', () => {
    const state = makeStateWithRule({
      id: 'rule_f_i',
      kind: 'ligatureSubstitution',
      components: ['f', 'i'],
      replacement: 'f_i',
      meta: { origin: 'manual' },
    })

    expect(needsOpenTypeFeatureCompilationForBinaryExport(state)).toBe(true)
    expect(
      needsOpenTypeFeatureCompilationForBinaryExport({
        ...state,
        exportPolicy: 'preserve-compiled-layout-tables',
      })
    ).toBe(false)
    expect(
      needsOpenTypeFeatureCompilationForBinaryExport(
        createEmptyOpenTypeFeaturesState()
      )
    ).toBe(false)
  })

  it('warns when binary feature compilation would need an unavailable runtime', () => {
    const warnings = deriveOpenTypeExportWarnings(
      makeStateWithRule({
        id: 'rule_f_i',
        kind: 'ligatureSubstitution',
        components: ['f', 'i'],
        replacement: 'f_i',
        meta: { origin: 'manual' },
      }),
      {
        compilerRuntimeStatus: createCompilerRuntimeStatus('not-configured'),
        diagnostics: [],
      }
    )

    expect(
      warnings.some(
        (warning) => warning.code === 'compiler-runtime-not-configured'
      )
    ).toBe(true)
  })

  it('warns when rebuilding imported FeatureVariations table data', () => {
    const featureVariationDiagnostic = {
      id: 'feature-diagnostic-warning-binary-extractor-gsub-feature-variations-present',
      severity: 'warning' as const,
      message:
        'GSUB FeatureVariations table is present. Kumiko preserves this as explicit unsupported compiled layout data; feature variation reconstruction is not implemented yet.',
      target: { kind: 'global' as const },
    }
    const state = {
      ...createEmptyOpenTypeFeaturesState(),
      sourceSections: [
        {
          id: 'source_compiled_gsub',
          title: 'GSUB compiled table',
          kind: 'compiled-table' as const,
          origin: 'binary-import' as const,
          format: 'opentype-layout-table' as const,
          stage: 'classified' as const,
          status: 'classified' as const,
          table: 'GSUB' as const,
          recordRefs: [
            {
              kind: 'diagnostic' as const,
              id: featureVariationDiagnostic.id,
              table: 'GSUB' as const,
            },
          ],
          preservationPolicy: 'editable-rebuild' as const,
        },
      ],
      diagnostics: [featureVariationDiagnostic],
    }

    const rebuildWarnings = deriveOpenTypeExportWarnings(state, {
      compilerRuntimeStatus: createCompilerRuntimeStatus(),
      diagnostics: state.diagnostics,
    })
    expect(
      rebuildWarnings.some((warning) => warning.code === 'feature-variations')
    ).toBe(true)

    const preserveWarnings = deriveOpenTypeExportWarnings(
      {
        ...state,
        exportPolicy: 'preserve-compiled-layout-tables',
      },
      {
        compilerRuntimeStatus: createCompilerRuntimeStatus(),
        diagnostics: state.diagnostics,
      }
    )
    expect(
      preserveWarnings.some((warning) => warning.code === 'feature-variations')
    ).toBe(false)
  })

  it('warns when rebuilding editable extension lookup wrappers', () => {
    const state = {
      ...createEmptyOpenTypeFeaturesState(),
      lookups: [
        {
          id: 'lookup_gsub_0',
          name: 'GSUB_lookup_0',
          table: 'GSUB' as const,
          lookupType: 'extensionSubst' as const,
          lookupFlag: {},
          rules: [],
          editable: true,
          origin: 'imported' as const,
          provenance: {
            table: 'GSUB' as const,
            lookupIndex: 0,
            lookupType: 7,
          },
          meta: {
            extensionLookupUnwrappedForEditing: true,
            extensionWrapperRebuildPolicy: 'rebuild-equivalent-rules',
          },
        },
      ],
      sourceSections: [
        {
          id: 'source_compiled_gsub',
          title: 'GSUB compiled table',
          kind: 'compiled-table' as const,
          origin: 'binary-import' as const,
          format: 'opentype-layout-table' as const,
          stage: 'classified' as const,
          status: 'classified' as const,
          table: 'GSUB' as const,
          recordRefs: [
            { kind: 'lookup' as const, id: 'lookup_gsub_0', table: 'GSUB' },
          ],
          preservationPolicy: 'editable-rebuild' as const,
          meta: {
            extensionLookupCount: 1,
            extensionLookupIds: ['lookup_gsub_0'],
          },
        },
      ],
    }

    const rebuildWarnings = deriveOpenTypeExportWarnings(state, {
      compilerRuntimeStatus: createCompilerRuntimeStatus(),
      diagnostics: [],
    })
    expect(
      rebuildWarnings.find(
        (warning) => warning.code === 'extension-wrapper-rebuild'
      )
    ).toMatchObject({
      severity: 'warning',
      details: ['GSUB lookup 0: extensionSubst'],
    })
    expect(deriveOpenTypeExportImpactItems(state)[0]?.detail).toContain(
      '1 extension lookup wrapper may be emitted as equivalent regular lookup rules.'
    )

    const preserveWarnings = deriveOpenTypeExportWarnings(
      {
        ...state,
        exportPolicy: 'preserve-compiled-layout-tables',
      },
      {
        compilerRuntimeStatus: createCompilerRuntimeStatus(),
        diagnostics: [],
      }
    )
    expect(
      preserveWarnings.some(
        (warning) => warning.code === 'extension-wrapper-rebuild'
      )
    ).toBe(false)
  })

  it('marks drop-unsupported rebuilds as requiring explicit confirmation', () => {
    const warnings = deriveOpenTypeExportWarnings(
      {
        ...createEmptyOpenTypeFeaturesState(),
        exportPolicy: 'drop-unsupported-and-rebuild',
        unsupportedLookups: [
          {
            id: 'unsupported_gsub_0',
            table: 'GSUB',
            lookupIndex: 0,
            lookupType: 6,
            subtableFormats: [3],
            reason: 'Chaining contextual substitution is not editable yet.',
            rawSummary: 'GSUB type 6 formats 3',
            preserveMode: 'drop-on-rebuild',
            provenance: {
              table: 'GSUB',
              lookupIndex: 0,
              lookupType: 6,
            },
          },
        ],
      },
      {
        compilerRuntimeStatus: createCompilerRuntimeStatus(),
        diagnostics: [],
      }
    )

    expect(requiresDropUnsupportedConfirmation(warnings)).toBe(true)
    expect(
      warnings.find(
        (warning) => warning.code === 'drop-unsupported-requires-confirmation'
      )?.details
    ).toEqual([
      'GSUB lookup 0: Chaining contextual substitution is not editable yet. (GSUB type 6 formats 3)',
    ])
  })

  it('summarizes source and unsupported lookup export impact', () => {
    const state = {
      ...createEmptyOpenTypeFeaturesState(),
      sourceSections: [
        {
          id: 'source_raw_feature_text',
          title: 'Handwritten .fea source',
          kind: 'manual-fea' as const,
          origin: 'manual-input' as const,
          format: 'fea' as const,
          stage: 'source' as const,
          status: 'raw' as const,
          textRef: 'rawFeatureText' as const,
          recordRefs: [],
          preservationPolicy: 'editable-rebuild' as const,
        },
        {
          id: 'source_compiled_gsub',
          title: 'GSUB compiled table',
          kind: 'compiled-table' as const,
          origin: 'binary-import' as const,
          format: 'opentype-layout-table' as const,
          stage: 'classified' as const,
          status: 'partially-classified' as const,
          table: 'GSUB' as const,
          recordRefs: [
            {
              kind: 'lookup' as const,
              id: 'lookup_gsub_0',
              table: 'GSUB' as const,
            },
            {
              kind: 'unsupportedLookup' as const,
              id: 'unsupported_gsub_1',
              table: 'GSUB' as const,
            },
          ],
          preservationPolicy: 'preserve-if-unchanged' as const,
        },
      ],
      unsupportedLookups: [
        {
          id: 'unsupported_gsub_1',
          table: 'GSUB' as const,
          lookupIndex: 1,
          lookupType: 8,
          subtableFormats: [1],
          reason: 'Reverse chaining is not editable yet.',
          rawSummary: 'GSUB type 8 format 1',
          preserveMode: 'preserve-if-unchanged' as const,
          provenance: {
            table: 'GSUB' as const,
            lookupIndex: 1,
            lookupType: 8,
          },
        },
      ],
    }

    expect(
      deriveOpenTypeExportImpactItems(state).map((item) => [
        item.kind,
        item.title,
        item.status,
      ])
    ).toEqual([
      ['source', 'Handwritten .fea source', 'raw'],
      ['source', 'GSUB compiled table', 'review'],
      ['unsupportedLookup', 'GSUB lookup 1', 'review'],
    ])
    expect(
      deriveOpenTypeExportImpactItems({
        ...state,
        exportPolicy: 'preserve-compiled-layout-tables',
      }).map((item) => item.status)
    ).toEqual(['raw', 'preserve', 'preserve'])
    expect(
      deriveOpenTypeExportImpactItems({
        ...state,
        exportPolicy: 'drop-unsupported-and-rebuild',
      }).map((item) => item.status)
    ).toEqual(['raw', 'review', 'drop'])
  })
})
