// Name → glyph id/advance catalog read straight out of a font buffer via
// HarfBuzz: maxp for the glyph count, hhea/hmtx for advances, the post table
// (through hb's glyph naming) for names. Built once per buffer and cached —
// the preview needs it to place glyphs the text alone cannot reach.

export interface CatalogGlyphInfo {
  glyphId: number
  advanceWidth: number
}

export type GlyphCatalog = Map<string, CatalogGlyphInfo>

const catalogCache = new WeakMap<ArrayBuffer, Promise<GlyphCatalog>>()

const readUint16 = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] << 8) | bytes[offset + 1]

const buildCatalog = async (fontBuffer: ArrayBuffer): Promise<GlyphCatalog> => {
  const { loadHarfBuzzRuntime } =
    await import('@/lib/openTypeFeatures/harfbuzzRuntime')
  const hb = await loadHarfBuzzRuntime()
  const blob = hb.createBlob(fontBuffer)
  try {
    const face = hb.createFace(blob, 0)
    try {
      const font = hb.createFont(face)
      try {
        const maxp = face.reference_table('maxp')
        const hhea = face.reference_table('hhea')
        const hmtx = face.reference_table('hmtx')
        if (!maxp || maxp.length < 6) {
          return new Map()
        }
        const glyphCount = readUint16(maxp, 4)
        const numberOfHMetrics =
          hhea && hhea.length >= 36 ? readUint16(hhea, 34) : 0

        const advanceFor = (glyphId: number) => {
          if (!hmtx || numberOfHMetrics === 0) {
            return 0
          }
          // Glyphs past numberOfHMetrics reuse the last long metric's advance.
          const index = Math.min(glyphId, numberOfHMetrics - 1)
          const offset = index * 4
          return hmtx.length >= offset + 2 ? readUint16(hmtx, offset) : 0
        }

        const catalog: GlyphCatalog = new Map()
        for (let glyphId = 0; glyphId < glyphCount; glyphId += 1) {
          const name = font.glyphName(glyphId)
          if (name && !catalog.has(name)) {
            catalog.set(name, { glyphId, advanceWidth: advanceFor(glyphId) })
          }
        }
        return catalog
      } finally {
        font.destroy()
      }
    } finally {
      face.destroy()
    }
  } finally {
    blob.destroy()
  }
}

export const getGlyphCatalog = (
  fontBuffer: ArrayBuffer
): Promise<GlyphCatalog> => {
  let pending = catalogCache.get(fontBuffer)
  if (!pending) {
    pending = buildCatalog(fontBuffer)
    catalogCache.set(fontBuffer, pending)
    pending.catch(() => catalogCache.delete(fontBuffer))
  }
  return pending
}
