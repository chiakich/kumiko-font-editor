import createHarfBuzz from 'harfbuzzjs/hb.js'
import createHarfBuzzJsRuntime from 'harfbuzzjs/hbjs.js'
import harfbuzzWasmUrl from 'harfbuzzjs/hb.wasm?url'
import { resolveHarfBuzzWasmLocation } from 'src/lib/openTypeFeatures/harfbuzzWasmLocation'

interface HarfBuzzBlob {
  destroy(): void
}

interface HarfBuzzFace {
  destroy(): void
}

interface HarfBuzzFont {
  destroy(): void
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

export interface HarfBuzzRuntime {
  createBlob(buffer: ArrayBuffer | Uint8Array): HarfBuzzBlob
  createBuffer(): HarfBuzzBuffer
  createFace(blob: HarfBuzzBlob, index: number): HarfBuzzFace
  createFont(face: HarfBuzzFace): HarfBuzzFont
  shape(font: HarfBuzzFont, buffer: HarfBuzzBuffer, features?: string): void
}

let runtimePromise: Promise<HarfBuzzRuntime> | null = null

export const loadHarfBuzzRuntime = async (): Promise<HarfBuzzRuntime> => {
  runtimePromise ??= createHarfBuzz({
    locateFile: (path) =>
      path === 'hb.wasm' ? resolveHarfBuzzWasmLocation(harfbuzzWasmUrl) : path,
  }).then((module) => createHarfBuzzJsRuntime(module))
  return runtimePromise
}
