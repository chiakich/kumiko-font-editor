import { listGlyphLayers } from 'src/store/glyphLayerOps'
import type {
  GlyphData,
  GlyphLayerData,
  GlyphLayerContent,
} from 'src/store/types'

export const ACTIVE_LAYER_FALLBACK = 'public.default'

// The id of the layer currently being edited/displayed for this glyph.
export const getActiveLayerId = (glyph: GlyphData): string =>
  glyph.activeLayerId ??
  glyph.layerOrder?.[0] ??
  Object.keys(glyph.layers ?? {})[0] ??
  ACTIVE_LAYER_FALLBACK

const blankLayer = (id: string): GlyphLayerData => ({
  id,
  name: id,
  type: 'master',
  associatedMasterId: id,
  paths: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 0 },
})

// The active layer's content — the single source of truth for the editable
// glyph. Never copies; under immer the returned object is the live draft.
export const activeLayer = (glyph: GlyphData): GlyphLayerData =>
  glyph.layers?.[getActiveLayerId(glyph)] ?? blankLayer(getActiveLayerId(glyph))

// Like activeLayer but guarantees the entry exists on the (immer) draft so
// edit actions can mutate it. Use this for writes, activeLayer for reads.
export const ensureActiveLayer = (glyph: GlyphData): GlyphLayerData => {
  const id = getActiveLayerId(glyph)
  glyph.layers = glyph.layers ?? {}
  if (!glyph.layers[id]) {
    glyph.layers[id] = blankLayer(id)
    glyph.layerOrder = glyph.layerOrder ?? []
    if (!glyph.layerOrder.includes(id)) {
      glyph.layerOrder.unshift(id)
    }
  }
  glyph.activeLayerId = id
  return glyph.layers[id]
}

export const getGlyphLayer = (
  glyph: GlyphData | undefined,
  layerId: string | null | undefined
): GlyphLayerData | null => {
  if (!glyph) {
    return null
  }
  const id = layerId ?? getActiveLayerId(glyph)
  return glyph.layers?.[id] ?? glyph.layers?.[getActiveLayerId(glyph)] ?? null
}

// Resolve the glyph's layer for the font-wide active master. null activeMasterId
// means "no master selected" → the glyph's own active layer. A non-null id with
// no matching master layer returns null (sparse: this glyph has no layer there).
export const getActiveLayer = (
  glyph: GlyphData | undefined,
  activeMasterId: string | null | undefined
): GlyphLayerData | null => {
  if (!glyph) {
    return null
  }
  if (!activeMasterId) {
    return getGlyphLayer(glyph, null)
  }
  const master = listGlyphLayers(glyph).find(
    (layer) =>
      layer.type === 'master' && layer.associatedMasterId === activeMasterId
  )
  return master ?? null
}

// Switch the active layer. With layers-as-truth this is just a pointer move — no
// content copy — so it can never desync. No-op if the layer does not exist here.
export const setGlyphActiveLayer = (
  glyph: GlyphData | undefined,
  layerId: string | null | undefined
) => {
  if (!glyph) {
    return
  }
  const id = layerId ?? getActiveLayerId(glyph)
  if (glyph.layers?.[id]) {
    glyph.activeLayerId = id
  }
}

// Immutably patch the active layer's content (for pure, non-immer call sites).
export const withActiveLayer = (
  glyph: GlyphData,
  patch: Partial<GlyphLayerContent>
): GlyphData => {
  const id = getActiveLayerId(glyph)
  const current = glyph.layers?.[id] ?? blankLayer(id)
  const layerOrder = glyph.layerOrder?.includes(id)
    ? glyph.layerOrder
    : [id, ...(glyph.layerOrder ?? [])]
  return {
    ...glyph,
    activeLayerId: id,
    layerOrder,
    layers: { ...(glyph.layers ?? {}), [id]: { ...current, ...patch } },
  }
}

// Fold any legacy top-level content (pre layers-as-truth persisted data) into the
// active layer, and strip the top-level fields. Idempotent: glyphs already in the
// new shape pass through with only layerOrder/activeLayerId normalised.
export const normalizeGlyphToLayers = (glyph: GlyphData): GlyphData => {
  const id = getActiveLayerId(glyph)
  const layers = { ...(glyph.layers ?? {}) }
  const legacy = glyph as unknown as Partial<GlyphLayerContent>

  if (!layers[id]) {
    layers[id] = {
      id,
      name: id,
      type: 'master',
      associatedMasterId: id,
      paths: legacy.paths ?? [],
      componentRefs: legacy.componentRefs ?? [],
      anchors: legacy.anchors ?? [],
      guidelines: legacy.guidelines ?? [],
      metrics: legacy.metrics ?? { lsb: 0, rsb: 0, width: 0 },
    }
  }

  const order = glyph.layerOrder ?? []
  const layerOrder = order.includes(id) ? order : [id, ...order]

  const stripped = { ...glyph } as Record<string, unknown>
  delete stripped.paths
  delete stripped.components
  delete stripped.componentRefs
  delete stripped.anchors
  delete stripped.guidelines
  delete stripped.metrics

  return {
    ...(stripped as unknown as GlyphData),
    activeLayerId: id,
    layers,
    layerOrder,
  }
}
