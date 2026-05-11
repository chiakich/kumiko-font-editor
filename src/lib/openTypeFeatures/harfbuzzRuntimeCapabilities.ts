import type { HarfBuzzRuntimeStatus } from 'src/lib/openTypeFeatures/harfbuzzTypes'

export interface HarfBuzzRuntimeCapability {
  packageName: 'harfbuzzjs'
  status: 'available'
  purpose: string
  notes: string
}

export const getHarfBuzzRuntimeCapabilities =
  (): HarfBuzzRuntimeCapability[] => [
    {
      packageName: 'harfbuzzjs',
      status: 'available',
      purpose: 'Shape text with HarfBuzz in browser or worker runtimes.',
      notes:
        'The package ships an Emscripten HarfBuzz WASM build. Kumiko uses it only for shaping previews and validation, not FEA compilation.',
    },
  ]

export const createHarfBuzzRuntimeStatus = (
  canShape = true
): HarfBuzzRuntimeStatus => ({
  backend: 'harfbuzzjs',
  canShape,
  message: canShape
    ? 'HarfBuzz WASM shaping runtime is available.'
    : 'HarfBuzz WASM shaping runtime is not available.',
  state: canShape ? 'ready' : 'not-configured',
})
