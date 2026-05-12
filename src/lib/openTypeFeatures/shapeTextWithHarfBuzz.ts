import { createHarfBuzzRuntimeStatus } from 'src/lib/openTypeFeatures/harfbuzzRuntimeCapabilities'
import type { HarfBuzzBufferGlyph } from 'src/lib/openTypeFeatures/harfbuzzRuntime'
import type {
  HarfBuzzRuntimeStatus,
  ShapeTextOptions,
  ShapeTextResult,
  ShapedGlyph,
} from 'src/lib/openTypeFeatures/harfbuzzTypes'

const makeFailure = (
  message: string,
  runtimeStatus: HarfBuzzRuntimeStatus
): ShapeTextResult => ({
  glyphs: [],
  message,
  ok: false,
  runtimeStatus,
})

const normalizeFeatureString = (features: string[] | undefined) =>
  features
    ?.map((feature) => feature.trim())
    .filter(Boolean)
    .join(',')

const toShapedGlyphs = (glyphs: HarfBuzzBufferGlyph[]): ShapedGlyph[] =>
  glyphs.map((glyph) => ({
    cluster: glyph.cluster,
    glyphId: glyph.codepoint,
    xAdvance: glyph.x_advance ?? 0,
    xOffset: glyph.x_offset ?? 0,
    yAdvance: glyph.y_advance ?? 0,
    yOffset: glyph.y_offset ?? 0,
  }))

export const shapeTextWithHarfBuzz = async (
  fontBuffer: ArrayBuffer,
  text: string,
  options: ShapeTextOptions = {}
): Promise<ShapeTextResult> => {
  if (!fontBuffer.byteLength) {
    return makeFailure(
      'Cannot shape text without a font buffer.',
      createHarfBuzzRuntimeStatus(false)
    )
  }

  if (!text) {
    return {
      glyphs: [],
      ok: true,
      runtimeStatus: createHarfBuzzRuntimeStatus(),
    }
  }

  try {
    const { loadHarfBuzzRuntime } =
      await import('src/lib/openTypeFeatures/harfbuzzRuntime')
    const hb = await loadHarfBuzzRuntime()
    const blob = hb.createBlob(fontBuffer)
    try {
      const face = hb.createFace(blob, 0)
      try {
        const font = hb.createFont(face)
        try {
          const buffer = hb.createBuffer()
          try {
            buffer.addText(text)
            if (options.direction) buffer.setDirection(options.direction)
            if (options.language) buffer.setLanguage(options.language)
            if (options.script) buffer.setScript(options.script)
            buffer.guessSegmentProperties()
            hb.shape(font, buffer, normalizeFeatureString(options.features))

            return {
              glyphs: toShapedGlyphs(buffer.getGlyphInfosAndPositions()),
              ok: true,
              runtimeStatus: createHarfBuzzRuntimeStatus(),
            }
          } finally {
            buffer.destroy()
          }
        } finally {
          font.destroy()
        }
      } finally {
        face.destroy()
      }
    } finally {
      blob.destroy()
    }
  } catch (error) {
    return makeFailure(
      error instanceof Error
        ? error.message
        : 'HarfBuzz WASM shaping runtime failed.',
      {
        backend: 'harfbuzzjs',
        canShape: false,
        message: 'HarfBuzz WASM shaping runtime failed to initialize or shape.',
        state: 'error',
      }
    )
  }
}
