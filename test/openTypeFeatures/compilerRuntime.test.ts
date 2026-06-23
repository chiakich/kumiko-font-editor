import { describe, expect, it } from 'vitest'
import {
  mapCompilerErrorsToDiagnostics,
  parseCompilerErrorLocations,
} from 'src/lib/openTypeFeatures/compilerErrorMapping'
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

describe('OpenType compiler diagnostics', () => {
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
