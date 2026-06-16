// Pure helpers for Glyphs-style backup layers. The active layer is the editable
// "hot" content held at the GlyphData top level; backup layers are outline
// snapshots kept in GlyphData.layers. These functions are immutable so they can
// be unit-tested without the store, and are wrapped by glyphActions.

import type { GlyphData, GlyphLayerData } from 'src/store/types'

interface LayerContent {
  paths: GlyphLayerData['paths']
  components: GlyphLayerData['components']
  componentRefs: GlyphLayerData['componentRefs']
  anchors: GlyphLayerData['anchors']
  guidelines: GlyphLayerData['guidelines']
  metrics: GlyphLayerData['metrics']
}

const masterLayerId = (glyph: GlyphData): string =>
  glyph.activeLayerId ?? 'public.default'

// Snapshots are deep-copied so a backup never shares mutable arrays with the
// hot content (or vice versa).
const clone = <T>(value: T): T => structuredClone(value)

const snapshotHot = (glyph: GlyphData): LayerContent => ({
  paths: clone(glyph.paths),
  components: clone(glyph.components),
  componentRefs: clone(glyph.componentRefs),
  anchors: clone(glyph.anchors ?? []),
  guidelines: clone(glyph.guidelines ?? []),
  metrics: clone(glyph.metrics),
})

const contentOf = (layer: GlyphLayerData): LayerContent => ({
  paths: clone(layer.paths),
  components: clone(layer.components),
  componentRefs: clone(layer.componentRefs),
  anchors: clone(layer.anchors),
  guidelines: clone(layer.guidelines),
  metrics: clone(layer.metrics),
})

// The list shown in the layer panel: the active master (synthesised from the
// hot content) followed by backup layers in order.
export const listGlyphLayers = (glyph: GlyphData): GlyphLayerData[] => {
  const masterId = masterLayerId(glyph)
  const layers = glyph.layers ?? {}
  const order = glyph.layerOrder ?? Object.keys(layers)

  const master: GlyphLayerData = {
    id: masterId,
    name: layers[masterId]?.name ?? 'Master',
    type: 'master',
    associatedMasterId: masterId,
    ...snapshotHot(glyph),
  }

  const backups = order
    .filter((layerId) => layerId !== masterId)
    .map((layerId) => layers[layerId])
    .filter((layer): layer is GlyphLayerData => Boolean(layer))
    .map((layer) => ({ ...layer, type: 'backup' as const }))

  return [master, ...backups]
}

export const createBackupLayer = (
  glyph: GlyphData,
  newId: string,
  name: string
): GlyphData => {
  const layers = { ...(glyph.layers ?? {}) }
  layers[newId] = {
    id: newId,
    name,
    type: 'backup',
    associatedMasterId: masterLayerId(glyph),
    ...snapshotHot(glyph),
  }
  const layerOrder = [
    ...(glyph.layerOrder ?? []).filter((layerId) => layerId !== newId),
    newId,
  ]
  return { ...glyph, layers, layerOrder }
}

export const duplicateLayer = (
  glyph: GlyphData,
  sourceId: string,
  newId: string,
  name: string
): GlyphData => {
  const source =
    sourceId === masterLayerId(glyph)
      ? snapshotHot(glyph)
      : glyph.layers?.[sourceId]
        ? contentOf(glyph.layers[sourceId])
        : null
  if (!source) {
    return glyph
  }
  const layers = { ...(glyph.layers ?? {}) }
  layers[newId] = {
    id: newId,
    name,
    type: 'backup',
    associatedMasterId: masterLayerId(glyph),
    ...source,
  }
  const layerOrder = [
    ...(glyph.layerOrder ?? []).filter((layerId) => layerId !== newId),
    newId,
  ]
  return { ...glyph, layers, layerOrder }
}

export const deleteBackupLayer = (
  glyph: GlyphData,
  layerId: string
): GlyphData => {
  // The master (active) layer cannot be deleted from the panel.
  if (layerId === masterLayerId(glyph) || !glyph.layers?.[layerId]) {
    return glyph
  }
  const layers = { ...glyph.layers }
  delete layers[layerId]
  const layerOrder = (glyph.layerOrder ?? []).filter((id) => id !== layerId)
  return { ...glyph, layers, layerOrder }
}

export const renameBackupLayer = (
  glyph: GlyphData,
  layerId: string,
  name: string
): GlyphData => {
  const layer = glyph.layers?.[layerId]
  if (!layer) {
    return glyph
  }
  return {
    ...glyph,
    layers: { ...glyph.layers, [layerId]: { ...layer, name } },
  }
}

// Glyphs "Use as Master": the backup's content moves onto the master layer, and
// the master's previous content is kept as a new backup. The promoted backup is
// removed.
export const promoteBackupToMaster = (
  glyph: GlyphData,
  backupId: string,
  newBackupId: string,
  newBackupName: string
): GlyphData => {
  const backup = glyph.layers?.[backupId]
  if (!backup) {
    return glyph
  }
  const layers = { ...glyph.layers }
  delete layers[backupId]
  layers[newBackupId] = {
    id: newBackupId,
    name: newBackupName,
    type: 'backup',
    associatedMasterId: masterLayerId(glyph),
    ...snapshotHot(glyph),
  }
  const layerOrder = (glyph.layerOrder ?? []).map((id) =>
    id === backupId ? newBackupId : id
  )
  if (!layerOrder.includes(newBackupId)) {
    layerOrder.push(newBackupId)
  }
  return { ...glyph, ...contentOf(backup), layers, layerOrder }
}
