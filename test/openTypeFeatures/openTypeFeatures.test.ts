import { describe, expect, it } from 'vitest'
import { applyAutoFeatureSuggestion } from 'src/lib/openTypeFeatures/applySuggestion'
import { buildAutoFeatureSuggestions } from 'src/lib/openTypeFeatures/buildAutoFeatureSuggestions'
import {
  canInstalledDependenciesCompileGeneratedFeaOffline,
  getInstalledCompilerDependencyCapabilities,
  getOpenTypeCompilerRuntimeRequirement,
} from 'src/lib/openTypeFeatures/compilerRuntimeCapabilities'
import {
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
  makeRuntimeNotConfiguredResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import {
  mapCompilerErrorsToDiagnostics,
  mapFeaLineToDiagnosticTarget,
  parseCompilerErrorLocations,
} from 'src/lib/openTypeFeatures/compilerErrorMapping'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import {
  deriveOpenTypeExportWarnings,
  needsOpenTypeFeatureCompilationForBinaryExport,
  requiresDropUnsupportedConfirmation,
} from 'src/lib/openTypeFeatures/exportPolicy'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import type {
  AutoFeatureSuggestion,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, GlyphData } from 'src/store/types'

const makeGlyph = (name: string, unicode?: string): GlyphData => ({
  id: name,
  name,
  paths: [],
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  unicode,
})

const makeFontData = (
  glyphs: Array<string | { name: string; unicode?: string }>
): FontData => {
  const glyphEntries = glyphs.map((glyph) => {
    const glyphData =
      typeof glyph === 'string'
        ? makeGlyph(glyph)
        : makeGlyph(glyph.name, glyph.unicode)
    return [glyphData.name, glyphData] as const
  })

  return {
    glyphs: Object.fromEntries(glyphEntries),
    glyphOrder: glyphEntries.map(([glyphName]) => glyphName),
    unitsPerEm: 1000,
  }
}

const makeSuggestions = (fontData: FontData) =>
  buildAutoFeatureSuggestions(fontData, createEmptyOpenTypeFeaturesState())

const findSuggestion = (
  suggestions: AutoFeatureSuggestion[],
  featureTag: string
) => {
  const suggestion = suggestions.find(
    (candidate) => candidate.featureTag === featureTag
  )
  expect(suggestion).toBeDefined()
  return suggestion as AutoFeatureSuggestion
}

const ruleReplacements = (lookup: LookupRecord) =>
  lookup.rules.map((rule) => {
    if (
      rule.kind !== 'ligatureSubstitution' &&
      rule.kind !== 'singleSubstitution'
    ) {
      throw new Error(`Unexpected rule kind in test fixture: ${rule.kind}`)
    }
    return rule.replacement
  })

const singleSubstitutionPairs = (lookup: LookupRecord) =>
  lookup.rules.map((rule) => {
    if (rule.kind !== 'singleSubstitution') {
      throw new Error(`Unexpected rule kind in test fixture: ${rule.kind}`)
    }
    if (rule.target.kind !== 'glyph') {
      throw new Error('Expected glyph selector in test fixture')
    }
    return `${rule.target.glyph}->${rule.replacement}`
  })

const makeStateWithRule = (rule: Rule): OpenTypeFeaturesState => ({
  ...createEmptyOpenTypeFeaturesState(),
  features: [
    {
      id: 'feature_liga',
      tag: 'liga',
      isActive: true,
      origin: 'manual',
      entries: [
        {
          id: 'entry_liga_DFLT_dflt',
          script: 'DFLT',
          language: 'dflt',
          lookupIds: ['lookup_liga_manual'],
        },
      ],
    },
  ],
  lookups: [
    {
      id: 'lookup_liga_manual',
      name: 'lookup_liga_manual',
      table: 'GSUB',
      lookupType: 'ligatureSubst',
      lookupFlag: {},
      rules: [rule],
      editable: true,
      origin: 'manual',
    },
  ],
})

describe('OpenType auto feature suggestions', () => {
  it('routes common and explicit ligatures to the expected features', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        'f',
        'i',
        'l',
        'c',
        't',
        'f_i',
        'f_l',
        'f_f',
        'f_f_i',
        'c_t',
        'c_t.liga',
        'c_t.dlig',
      ])
    )

    expect(
      ruleReplacements(findSuggestion(suggestions, 'liga').lookup)
    ).toEqual(['f_i', 'f_l', 'f_f', 'f_f_i', 'c_t.liga'])
    expect(
      ruleReplacements(findSuggestion(suggestions, 'dlig').lookup)
    ).toEqual(['c_t', 'c_t.dlig'])
  })

  it('builds stylistic set suggestions from ss01 and ss02 suffixes', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        'a',
        'a.ss01',
        'b',
        'b.ss01',
        'ampersand',
        'ampersand.ss02',
      ])
    )

    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'ss01').lookup)
    ).toEqual(['a->a.ss01', 'b->b.ss01'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'ss02').lookup)
    ).toEqual(['ampersand->ampersand.ss02'])
  })

  it('uses unicode metadata for small cap source classification', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        { name: 'smallSource', unicode: '0061' },
        { name: 'capSource', unicode: '0041' },
        'smallSource.sc',
        'capSource.sc',
      ])
    )

    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'smcp').lookup)
    ).toEqual(['smallSource->smallSource.sc'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'c2sc').lookup)
    ).toEqual(['capSource->capSource.sc'])
  })

  it('builds numeral feature suggestions from numeral suffixes', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        'zero',
        'one',
        'zero.osf',
        'one.osf',
        'zero.lf',
        'one.lf',
        'zero.tf',
        'one.tf',
        'zero.pnum',
        'one.pnum',
      ])
    )

    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'onum').lookup)
    ).toEqual(['zero->zero.osf', 'one->one.osf'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'lnum').lookup)
    ).toEqual(['zero->zero.lf', 'one->one.lf'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'tnum').lookup)
    ).toEqual(['zero->zero.tf', 'one->one.tf'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'pnum').lookup)
    ).toEqual(['zero->zero.pnum', 'one->one.pnum'])
  })
})

describe('OpenType FEA source maps', () => {
  it('emits trace comments and source map entries for generated rules', () => {
    const generated = generateFea(
      makeStateWithRule({
        id: 'rule_f_i',
        kind: 'ligatureSubstitution',
        components: ['f', 'i'],
        replacement: 'f_i',
        meta: { origin: 'manual' },
      })
    )

    expect(generated.text).toContain('# kumiko-rule-id: rule_f_i')
    expect(generated.text).toContain('sub f i by f_i;')
    expect(
      generated.sourceMap.entries.some((entry) => entry.ruleId === 'rule_f_i')
    ).toBe(true)
  })

  it('keeps accepted suggestions available to FEA generation', () => {
    const suggestion = findSuggestion(
      makeSuggestions(makeFontData(['f', 'i', 'f_i'])),
      'liga'
    )
    const generated = generateFea(
      applyAutoFeatureSuggestion(createEmptyOpenTypeFeaturesState(), suggestion)
    )

    expect(generated.text).toContain('sub f i by f_i;')
    expect(generated.sourceMap.entries.length > 0).toBe(true)
  })

  it('maps compiler line numbers back to generated rule diagnostics', () => {
    const generated = generateFea(
      makeStateWithRule({
        id: 'rule_f_i',
        kind: 'ligatureSubstitution',
        components: ['f', 'i'],
        replacement: 'f_i',
        meta: { origin: 'manual' },
      })
    )
    const ruleLine =
      generated.text
        .split('\n')
        .findIndex((line) => line.trim() === 'sub f i by f_i;') + 1

    expect(mapFeaLineToDiagnosticTarget(generated.sourceMap, ruleLine)).toEqual(
      {
        kind: 'rule',
        ruleId: 'rule_f_i',
      }
    )
  })

  it('parses fontTools-style FEA error locations', () => {
    expect(
      parseCompilerErrorLocations(
        'features.fea:12:7: Expected glyph name\nline 18, column 3: Bad lookup'
      )
    ).toEqual([
      {
        column: 7,
        line: 12,
        message: 'features.fea:12:7: Expected glyph name',
      },
      {
        column: 3,
        line: 18,
        message: 'line 18, column 3: Bad lookup',
      },
    ])
  })

  it('builds mapped compiler diagnostics from source map entries', () => {
    const sourceMap = {
      entries: [
        {
          featureId: 'feature_liga',
          lineStart: 4,
          lineEnd: 12,
        },
        {
          lookupId: 'lookup_liga_manual',
          lineStart: 6,
          lineEnd: 11,
        },
        {
          ruleId: 'rule_f_i',
          lineStart: 9,
          lineEnd: 9,
        },
      ],
    }

    expect(
      mapCompilerErrorsToDiagnostics({
        fallbackMessage: 'Compilation failed',
        rawCompilerOutput: 'features.fea:9:5: Unknown glyph "f_i"',
        sourceMap,
      })
    ).toMatchObject([
      {
        message: 'features.fea:9:5: Unknown glyph "f_i"',
        severity: 'error',
        target: {
          kind: 'rule',
          ruleId: 'rule_f_i',
        },
      },
    ])
  })
})

describe('OpenType compiler runtime scaffold', () => {
  it('documents the configured Pyodide fontTools compiler runtime', () => {
    expect(canInstalledDependenciesCompileGeneratedFeaOffline()).toBe(true)

    expect(getInstalledCompilerDependencyCapabilities()).toEqual([
      expect.objectContaining({
        dependency: 'opentype.js',
        status: 'insufficient',
        missingCapabilities: expect.arrayContaining([
          'Parse generated .fea feature-file syntax.',
        ]),
      }),
      expect.objectContaining({
        dependency: 'fonteditor-core',
        status: 'insufficient',
        missingCapabilities: expect.arrayContaining([
          'Rebuild GSUB, GPOS, and GDEF tables from editable feature rules.',
        ]),
      }),
      expect.objectContaining({
        dependency: 'pyodide-fonttools',
        status: 'available',
        missingCapabilities: [],
      }),
    ])

    expect(getOpenTypeCompilerRuntimeRequirement()).toMatchObject({
      canCompileGeneratedFeaWithInstalledDependencies: true,
      recommendedBackends: ['pyodide-fonttools', 'wasm-fonttools'],
    })
  })

  it('reports a ready Pyodide compiler status by default', () => {
    expect(createCompilerRuntimeStatus()).toEqual({
      backend: 'pyodide-fonttools',
      canCompile: true,
      message:
        'OpenType feature compilation is available through a lazy-loaded Pyodide fontTools worker runtime.',
      state: 'ready',
    })
  })

  it('can still construct an explicit not-configured compiler status', () => {
    expect(createCompilerRuntimeStatus('not-configured')).toEqual({
      backend: 'not-configured',
      canCompile: false,
      message:
        'OpenType feature compilation is not configured yet. Generated FEA can be inspected, but binary layout compilation needs an offline WASM font compiler runtime.',
      state: 'not-configured',
    })
  })

  it('returns structured diagnostics when no compiler runtime is configured', () => {
    const response = makeRuntimeNotConfiguredResponse()

    expect(response.type).toBe('compile-error')
    expect(response.payload.backend).toBe('not-configured')
    expect(response.payload.runtimeStatus.canCompile).toBe(false)
    expect(response.payload.diagnostics).toMatchObject([
      {
        severity: 'error',
        target: { kind: 'global' },
      },
    ])
  })

  it('can create mapped compiler error payloads without a runtime', () => {
    const runtimeStatus = createCompilerRuntimeStatus('pyodide-fonttools')
    const response = makeCompilerErrorResponse({
      backend: runtimeStatus.backend,
      message: 'fontTools compilation failed',
      rawCompilerOutput: 'features.fea:21:1: Unknown lookup',
      runtimeStatus,
      sourceMap: {
        entries: [
          {
            lookupId: 'lookup_kern_imported',
            lineStart: 20,
            lineEnd: 24,
          },
        ],
      },
    })

    expect(response.payload.diagnostics).toMatchObject([
      {
        severity: 'error',
        target: {
          kind: 'lookup',
          lookupId: 'lookup_kern_imported',
        },
      },
    ])
  })
})

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
