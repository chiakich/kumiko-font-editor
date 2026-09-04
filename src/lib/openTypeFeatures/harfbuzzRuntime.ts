import createHarfBuzz from 'harfbuzzjs/hb.js'
import createHarfBuzzJsRuntime from 'harfbuzzjs/hbjs.js'
import harfbuzzWasmUrl from 'harfbuzzjs/hb.wasm?url'
import { resolveHarfBuzzWasmLocation } from '@/lib/openTypeFeatures/harfbuzzWasmLocation'

interface HarfBuzzBlob {
  destroy(): void
}

interface HarfBuzzFace {
  destroy(): void
  upem: number
  // Raw bytes of one OpenType table, or undefined when the face lacks it.
  reference_table(table: string): Uint8Array | undefined
}

interface HarfBuzzFont {
  destroy(): void
  // Post-table glyph name, or "gidN" when the font has none.
  glyphName(glyphId: number): string
  // Outline as an SVG path in font units, y-up.
  glyphToPath(glyphId: number): string
}

export interface HarfBuzzBufferGlyph {
  codepoint: number
  cluster: number
  x_advance?: number
  y_advance?: number
  x_offset?: number
  y_offset?: number
}

interface HarfBuzzBuffer {
  addText(text: string): void
  destroy(): void
  getGlyphInfosAndPositions(): HarfBuzzBufferGlyph[]
  guessSegmentProperties(): void
  setDirection(direction: string): void
  setLanguage(language: string): void
  setScript(script: string): void
}

export interface HarfBuzzTraceGlyph {
  g: number
  cl: number
  dx?: number
  dy?: number
  ax?: number
  ay?: number
}

export interface HarfBuzzTraceEntry {
  // HarfBuzz shaping message, e.g. "end lookup 25 feature 'calt'".
  m: string
  // Buffer snapshot right after the message.
  t: HarfBuzzTraceGlyph[]
  // Whether the buffer holds glyphs yet (false during Unicode preprocessing).
  glyphs: boolean
}

export interface HarfBuzzRuntime {
  createBlob(buffer: ArrayBuffer | Uint8Array): HarfBuzzBlob
  createBuffer(): HarfBuzzBuffer
  createFace(blob: HarfBuzzBlob, index: number): HarfBuzzFace
  createFont(face: HarfBuzzFace): HarfBuzzFont
  shape(font: HarfBuzzFont, buffer: HarfBuzzBuffer, features?: string): void
  // Shapes like shape() while collecting a per-message trace of the buffer.
  shapeWithTrace(
    font: HarfBuzzFont,
    buffer: HarfBuzzBuffer,
    features: string | undefined,
    stopAtLookup: number,
    stopPhase: number
  ): HarfBuzzTraceEntry[]
}

let runtimePromise: Promise<HarfBuzzRuntime> | null = null

export const loadHarfBuzzRuntime = async (): Promise<HarfBuzzRuntime> => {
  runtimePromise ??= createHarfBuzz({
    locateFile: (path) =>
      path === 'hb.wasm' ? resolveHarfBuzzWasmLocation(harfbuzzWasmUrl) : path,
  }).then((module) => createHarfBuzzJsRuntime(module))
  return runtimePromise
}
