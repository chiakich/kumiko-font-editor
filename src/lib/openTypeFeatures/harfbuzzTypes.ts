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
  // Also read each glyph's name and outline out of the font, for callers that
  // draw the shaped run instead of just measuring it.
  includeGlyphShapes?: boolean
  // Cluster (UTF-16 index) → glyph name: placeholders at these clusters are
  // swapped for the named glyph after shaping, letting a run carry glyphs the
  // text cannot spell (see shapingPreviewTokens).
  glyphTokens?: ReadonlyMap<number, string>
}

export interface ShapedGlyph {
  glyphId: number
  cluster: number
  xAdvance: number
  yAdvance: number
  xOffset: number
  yOffset: number
  // Present when shaping ran with includeGlyphShapes.
  glyphName?: string
  // SVG path in font units, y-up; empty for blank glyphs.
  svgPath?: string
  // Set when a glyph token asked for a name the font does not have.
  unknownGlyphToken?: string
}

export interface ShapeTextSuccess {
  ok: true
  glyphs: ShapedGlyph[]
  // Units per em of the shaped face; lets a renderer scale font units.
  unitsPerEm?: number
  runtimeStatus: HarfBuzzRuntimeStatus
}

export interface ShapeTextFailure {
  ok: false
  glyphs: []
  message: string
  runtimeStatus: HarfBuzzRuntimeStatus
}

export type ShapeTextResult = ShapeTextSuccess | ShapeTextFailure
