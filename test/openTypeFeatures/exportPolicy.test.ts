import { describe, expect, it } from 'vitest'
import { createCompilerRuntimeStatus } from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import {
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
})
