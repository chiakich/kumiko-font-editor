import { exportFontAsBinary } from 'src/lib/fontFormats/fontBinaryFormat'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'

// Store updates are immutable, so object identity is the change signal: a new
// fontData or features object means the compiled preview font is stale.
const cache = new WeakMap<FontData, WeakMap<object, Promise<ArrayBuffer>>>()

// Stand-in cache key for a font with no feature state at all.
const NO_FEATURES_KEY = {}

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
    // The preview must reflect the feature state being edited, which can be
    // ahead of what fontData still carries.
    const exportSource =
      fontData.openTypeFeatures === openTypeFeatures
        ? fontData
        : { ...fontData, openTypeFeatures }
    pending = exportFontAsBinary(exportSource, 'ttf').then((blob) =>
      blob.arrayBuffer()
    )
    byFeatures.set(featuresKey, pending)
    // A failed compile must not be sticky, or the preview can never recover.
    pending.catch(() => byFeatures?.delete(featuresKey))
  }
  return pending
}
