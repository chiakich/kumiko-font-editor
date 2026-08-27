import { createHarfBuzzRuntimeStatus } from 'src/lib/openTypeFeatures/harfbuzzRuntimeCapabilities'
import { getGlyphCatalog } from 'src/lib/openTypeFeatures/harfbuzzGlyphCatalog'
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

const toShapedGlyphs = (
  glyphs: HarfBuzzBufferGlyph[],
  readShape?: (glyphId: number) => { glyphName: string; svgPath: string }
): ShapedGlyph[] =>
  glyphs.map((glyph) => ({
    cluster: glyph.cluster,
    glyphId: glyph.codepoint,
    xAdvance: glyph.x_advance ?? 0,
    xOffset: glyph.x_offset ?? 0,
    yAdvance: glyph.y_advance ?? 0,
    yOffset: glyph.y_offset ?? 0,
    ...(readShape ? readShape(glyph.codepoint) : {}),
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
    const catalog = options.glyphTokens?.size
      ? await getGlyphCatalog(fontBuffer)
      : null
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

            // Cached per glyph id: a run repeats glyphs, outline extraction
            // does not come free.
            const shapeCache = new Map<
              number,
              { glyphName: string; svgPath: string }
            >()
            const readShape = options.includeGlyphShapes
              ? (glyphId: number) => {
                  let shape = shapeCache.get(glyphId)
                  if (!shape) {
                    shape = {
                      glyphName: font.glyphName(glyphId),
                      svgPath: font.glyphToPath(glyphId),
                    }
                    shapeCache.set(glyphId, shape)
                  }
                  return shape
                }
              : undefined

            const shapedGlyphs = toShapedGlyphs(
              buffer.getGlyphInfosAndPositions(),
              readShape
            )

            // Swap each token placeholder for its named glyph. Metrics come
            // from the catalog; the vertical origin shift hb computed for the
            // placeholder is kept, since the fallback is font-wide anyway.
            const withTokens = options.glyphTokens?.size
              ? shapedGlyphs.map((glyph) => {
                  const tokenName = options.glyphTokens?.get(glyph.cluster)
                  if (!tokenName) {
                    return glyph
                  }
                  const info = catalog?.get(tokenName)
                  if (!info) {
                    return { ...glyph, unknownGlyphToken: tokenName }
                  }
                  const isVertical =
                    options.direction === 'ttb' || options.direction === 'btt'
                  return {
                    ...glyph,
                    glyphId: info.glyphId,
                    glyphName: tokenName,
                    svgPath: options.includeGlyphShapes
                      ? font.glyphToPath(info.glyphId)
                      : glyph.svgPath,
                    ...(isVertical
                      ? { xOffset: -info.advanceWidth / 2 }
                      : { xAdvance: info.advanceWidth, xOffset: 0 }),
                  }
                })
              : shapedGlyphs

            return {
              glyphs: withTokens,
              ok: true,
              unitsPerEm: face.upem,
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
