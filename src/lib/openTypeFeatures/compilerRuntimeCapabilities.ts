export type CompilerDependencyCapabilityStatus = 'available' | 'insufficient'

export interface CompilerDependencyCapability {
  dependency: 'opentype.js' | 'fonteditor-core'
  status: CompilerDependencyCapabilityStatus
  browserWorkerSafe: boolean
  finding: string
  missingCapabilities: string[]
}

export interface CompilerRuntimeRequirement {
  canCompileGeneratedFeaWithInstalledDependencies: boolean
  requiredCapabilities: string[]
  recommendedBackends: Array<'pyodide-fonttools' | 'wasm-fonttools'>
  notes: string[]
}

export const getInstalledCompilerDependencyCapabilities =
  (): CompilerDependencyCapability[] => [
    {
      dependency: 'opentype.js',
      status: 'insufficient',
      browserWorkerSafe: true,
      finding:
        'Installed opentype.js can parse/write font structures and has partial GSUB/GPOS table helpers, but it does not provide an Adobe FEA parser or a feature-file compiler.',
      missingCapabilities: [
        'Parse generated .fea feature-file syntax.',
        'Compile arbitrary GSUB, GPOS, and GDEF features from FEA into binary layout tables.',
        'Return compiler diagnostics that can be mapped through Kumiko source-map comments.',
      ],
    },
    {
      dependency: 'fonteditor-core',
      status: 'insufficient',
      browserWorkerSafe: true,
      finding:
        'Installed fonteditor-core can parse, write, convert, and preserve some existing layout tables, but it does not build OpenType Layout tables from FEA.',
      missingCapabilities: [
        'Parse generated .fea feature-file syntax.',
        'Rebuild GSUB, GPOS, and GDEF tables from editable feature rules.',
        'Report feature compiler diagnostics for invalid feature code.',
      ],
    },
  ]

export const getOpenTypeCompilerRuntimeRequirement =
  (): CompilerRuntimeRequirement => ({
    canCompileGeneratedFeaWithInstalledDependencies: false,
    requiredCapabilities: [
      'Run fully offline in a browser Web Worker.',
      'Accept an input TTF/OTF ArrayBuffer and generated FEA string.',
      'Compile or replace selected GSUB, GPOS, and GDEF tables using OpenType feature-file semantics.',
      'Return an output font ArrayBuffer plus structured diagnostics.',
      'Preserve enough compiler output to map errors back through GeneratedFeaSourceMap.',
    ],
    recommendedBackends: ['pyodide-fonttools', 'wasm-fonttools'],
    notes: [
      'A Pyodide + fontTools adapter is the most realistic known path, but it would add a large runtime payload and initialization cost.',
      'A smaller WASM fontTools/feaLib backend would be preferable if it can be built and maintained, but no such dependency is currently installed.',
      'Until one of those backends is wired, Kumiko should continue gating binary feature export instead of silently exporting unmanaged layout edits.',
    ],
  })

export const canInstalledDependenciesCompileGeneratedFeaOffline = () =>
  getOpenTypeCompilerRuntimeRequirement()
    .canCompileGeneratedFeaWithInstalledDependencies
