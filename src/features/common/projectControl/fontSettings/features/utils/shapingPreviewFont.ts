import { buildSfntInWorker } from '@/lib/fontFormats/previewSfntWorkerClient'
import { getBinaryExportGlyphList } from '@/lib/fontFormats/fontBinaryFormat'
import { compileManagedFontFeatures } from '@/lib/openTypeFeatures/compileManagedFontFeatures'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'
import type { FontData } from '@/store'

// Store updates are immutable, so object identity is the change signal: a new
// fontData or features object means the compiled preview font is stale.
const cache = new WeakMap<FontData, WeakMap<object, Promise<ArrayBuffer>>>()

// Stand-in cache key for a font with no feature state at all.
const NO_FEATURES_KEY = {}

const buildPreviewFontBuffer = async (
  fontData: FontData,
  openTypeFeatures: OpenTypeFeaturesState | undefined
): Promise<ArrayBuffer> => {
  const glyphs = getBinaryExportGlyphList(fontData)
  // The outline serialization runs in a worker; the feature compile runs on
  // the shared persistent compiler worker. The main thread only coordinates.
  const sfntBuffer = await buildSfntInWorker({
    fontData: {
      fontInfo: fontData.fontInfo,
      unitsPerEm: fontData.unitsPerEm,
      lineMetricsHorizontalLayout: fontData.lineMetricsHorizontalLayout,
      openTypeFeatures,
      kerningGroups: fontData.kerningGroups,
      kerningPairs: fontData.kerningPairs,
      verticalKerningPairs: fontData.verticalKerningPairs,
    },
    glyphs,
  })
  return compileManagedFontFeatures(sfntBuffer, openTypeFeatures, {
    kerningGroups: fontData.kerningGroups,
    kerningPairs: fontData.kerningPairs,
    verticalKerningPairs: fontData.verticalKerningPairs,
    availableGlyphIds: new Set(glyphs.map((glyph) => glyph.id)),
  })
}

// Compiles the current canonical font (outlines + feature state) into a binary
// the shaping preview can hand to HarfBuzz. The result is cached per state
// identity: typing in the preview never recompiles, only editing does.
export const getShapingPreviewFontBuffer = (
  fontData: FontData,
  openTypeFeatures: OpenTypeFeaturesState | undefined
): Promise<ArrayBuffer> => {
  let byFeatures = cache.get(fontData)
  if (!byFeatures) {
    byFeatures = new WeakMap()
    cache.set(fontData, byFeatures)
  }
  const featuresKey = openTypeFeatures ?? NO_FEATURES_KEY
  let pending = byFeatures.get(featuresKey)
  if (!pending) {
    pending = buildPreviewFontBuffer(fontData, openTypeFeatures)
    byFeatures.set(featuresKey, pending)
    // A failed compile must not be sticky, or the preview can never recover.
    pending.catch(() => byFeatures?.delete(featuresKey))
  }
  return pending
}
