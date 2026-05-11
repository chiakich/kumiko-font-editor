export type HarfBuzzRuntimeState =
  | 'not-configured'
  | 'initializing'
  | 'ready'
  | 'error'

export interface HarfBuzzRuntimeStatus {
  backend: 'harfbuzzjs'
  canShape: boolean
  message: string
  state: HarfBuzzRuntimeState
}

export type HarfBuzzDirection = 'ltr' | 'rtl' | 'ttb' | 'btt'

export interface ShapeTextOptions {
  direction?: HarfBuzzDirection
  features?: string[]
  language?: string
  script?: string
}

export interface ShapedGlyph {
  glyphId: number
  cluster: number
  xAdvance: number
  yAdvance: number
  xOffset: number
  yOffset: number
}

export interface ShapeTextSuccess {
  ok: true
  glyphs: ShapedGlyph[]
  runtimeStatus: HarfBuzzRuntimeStatus
}

export interface ShapeTextFailure {
  ok: false
  glyphs: []
  message: string
  runtimeStatus: HarfBuzzRuntimeStatus
}

export type ShapeTextResult = ShapeTextSuccess | ShapeTextFailure
