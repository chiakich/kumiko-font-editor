declare module 'harfbuzzjs/hb.js' {
  export interface HarfBuzzModuleOptions {
    locateFile?: (path: string) => string
  }

  export interface HarfBuzzModule {
    HEAP32: Int32Array
    HEAPU32: Uint32Array
    wasmExports: Record<string, unknown>
  }

  const createHarfBuzz: (
    options?: HarfBuzzModuleOptions
  ) => Promise<HarfBuzzModule>

  export default createHarfBuzz
}

declare module 'harfbuzzjs/hbjs.js' {
  import type { HarfBuzzRuntime } from 'src/lib/openTypeFeatures/harfbuzzRuntime'
  import type { HarfBuzzModule } from 'harfbuzzjs/hb.js'

  const createHarfBuzzJsRuntime: (module: HarfBuzzModule) => HarfBuzzRuntime
  export default createHarfBuzzJsRuntime
}
