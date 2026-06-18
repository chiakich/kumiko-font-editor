// Pure helpers for glyph layers. With layers-as-truth all content lives in
// GlyphData.layers (keyed by id). The selected/active layer may be a backup;
// master identity comes from the layer's type, matching Glyphs' layer UX.

import type { GlyphData, GlyphLayerData } from 'src/store/types'

interface LayerContent {
  paths: GlyphLayerData['paths']
  componentRefs: GlyphLayerData['componentRefs']
  anchors: GlyphLayerData['anchors']
  guidelines: GlyphLayerData['guidelines']
  metrics: GlyphLayerData['metrics']
}

// Kept local (not imported from glyphLayer) to avoid an import cycle.
const masterLayerId = (glyph: GlyphData): string =>
  (glyph.layerOrder ?? []).find(
    (id) => glyph.layers?.[id]?.type === 'master'
  ) ??
  Object.entries(glyph.layers ?? {}).find(
    ([, layer]) => layer.type === 'master'
  )?.[0] ??
  glyph.activeLayerId ??
  glyph.layerOrder?.[0] ??
  Object.keys(glyph.layers ?? {})[0] ??
  'public.default'

// Content is deep-copied so a new layer never shares mutable arrays.
const clone = <T>(value: T): T => structuredClone(value)

const contentOf = (layer: GlyphLayerData): LayerContent => ({
  paths: clone(layer.paths),
  componentRefs: clone(layer.componentRefs),
  anchors: clone(layer.anchors),
  guidelines: clone(layer.guidelines),
  metrics: clone(layer.metrics),
})

const emptyContent = (): LayerContent => ({
  paths: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 0 },
})

const masterContent = (glyph: GlyphData): LayerContent => {
  const master = glyph.layers?.[masterLayerId(glyph)]
  return master ? contentOf(master) : emptyContent()
}

// The list shown in the layer panel: master layers first, then backups in
// layerOrder. Selection does not change a layer's master/backup identity.
export const listGlyphLayers = (glyph: GlyphData): GlyphLayerData[] => {
  const layers = glyph.layers ?? {}
  const masterId = masterLayerId(glyph)
  const order = glyph.layerOrder ?? Object.keys(layers)
  const seen = new Set<string>()
  const result: GlyphLayerData[] = []

  const push = (id: string) => {
    const layer = layers[id]
    if (!layer || seen.has(id)) {
      return
    }
    seen.add(id)
    result.push(layer)
  }

  push(masterId)
  for (const id of order) {
    push(id)
  }
  for (const id of Object.keys(layers)) {
    push(id)
  }
  return result
}

// A backup layer's id is its display name (a date-time string). Collisions are
// disambiguated with " (2)", " (3)", … so the id stays unique without a
// separate name table — the UFO layer name carries the name on round-trip.
const uniqueLayerId = (
  baseName: string,
  glyph: GlyphData,
  ignoreId?: string
): string => {
  const taken = new Set(Object.keys(glyph.layers ?? {}))
  taken.add(masterLayerId(glyph))
  if (ignoreId) {
    taken.delete(ignoreId)
  }
  if (!taken.has(baseName)) {
    return baseName
  }
  let counter = 2
  while (taken.has(`${baseName} (${counter})`)) {
    counter += 1
  }
  return `${baseName} (${counter})`
}

export const createBackupLayer = (
  glyph: GlyphData,
  name: string
): GlyphData => {
  const id = uniqueLayerId(name, glyph)
  const layers = { ...(glyph.layers ?? {}) }
  layers[id] = {
    id,
    name: id,
    type: 'backup',
    associatedMasterId: masterLayerId(glyph),
    ...masterContent(glyph),
  }
  return { ...glyph, layers, layerOrder: [...(glyph.layerOrder ?? []), id] }
}

export const duplicateLayer = (
  glyph: GlyphData,
  sourceId: string,
  name: string
): GlyphData => {
  const source = glyph.layers?.[sourceId]
  if (!source) {
    return glyph
  }
  const id = uniqueLayerId(name, glyph)
  const layers = { ...(glyph.layers ?? {}) }
  layers[id] = {
    id,
    name: id,
    type: 'backup',
    associatedMasterId: masterLayerId(glyph),
    ...contentOf(source),
  }
  return { ...glyph, layers, layerOrder: [...(glyph.layerOrder ?? []), id] }
}

export const deleteBackupLayer = (
  glyph: GlyphData,
  layerId: string
): GlyphData => {
  // Master layers cannot be deleted from the backup-layer panel.
  const layer = glyph.layers?.[layerId]
  if (!layer || layer.type === 'master') {
    return glyph
  }
  const layers = { ...glyph.layers }
  delete layers[layerId]
  const layerOrder = (glyph.layerOrder ?? []).filter((id) => id !== layerId)
  return {
    ...glyph,
    activeLayerId:
      glyph.activeLayerId === layerId
        ? masterLayerId(glyph)
        : glyph.activeLayerId,
    layers,
    layerOrder,
  }
}

// Renaming re-keys the layer (id === name), so the new name survives the UFO
// round-trip without a separate name table.
export const renameBackupLayer = (
  glyph: GlyphData,
  layerId: string,
  name: string
): GlyphData => {
  const layer = glyph.layers?.[layerId]
  if (!layer || layer.type === 'master') {
    return glyph
  }
  const id = uniqueLayerId(name, glyph, layerId)
  if (id === layerId) {
    return glyph
  }
  const layers = { ...glyph.layers }
  delete layers[layerId]
  layers[id] = { ...layer, id, name: id }
  const layerOrder = (glyph.layerOrder ?? []).map((existing) =>
    existing === layerId ? id : existing
  )
  return {
    ...glyph,
    activeLayerId: glyph.activeLayerId === layerId ? id : glyph.activeLayerId,
    layers,
    layerOrder,
  }
}

// Glyphs "Use as Master": the backup's content moves onto the master layer, and
// the master's previous content is kept as a new backup. The promoted backup is
// removed.
export const promoteBackupToMaster = (
  glyph: GlyphData,
  backupId: string,
  newBackupName: string
): GlyphData => {
  const backup = glyph.layers?.[backupId]
  if (!backup || backup.type === 'master') {
    return glyph
  }
  const masterId = masterLayerId(glyph)
  const master = glyph.layers?.[masterId]
  const newId = uniqueLayerId(newBackupName, glyph, backupId)
  const layers = { ...glyph.layers }
  delete layers[backupId]
  if (master) {
    layers[newId] = {
      id: newId,
      name: newId,
      type: 'backup',
      associatedMasterId: masterId,
      ...contentOf(master),
    }
  }
  layers[masterId] = {
    id: masterId,
    name: master?.name ?? masterId,
    type: 'master',
    associatedMasterId: masterId,
    ...contentOf(backup),
  }
  const layerOrder = (glyph.layerOrder ?? []).map((id) =>
    id === backupId ? newId : id
  )
  if (!layerOrder.includes(newId)) {
    layerOrder.push(newId)
  }
  return { ...glyph, activeLayerId: masterId, layers, layerOrder }
}
