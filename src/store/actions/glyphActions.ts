/**
 * Glyph-level store actions: add/delete glyphs, update node positions/types,
 * update glyph metrics.
 */
import { current } from 'immer'
import type { StateCreator } from 'zustand'
import type {
  FontData,
  GlobalState,
  GlyphData,
  GlyphMetrics,
  OnCurveNodeType,
} from 'src/store/types'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import { findSourceIdAtLocation } from 'src/font/designspaceLocation'
import {
  createBackupLayer,
  deleteBackupLayer,
  duplicateLayer,
  renameBackupLayer,
  promoteBackupToMaster,
} from 'src/store/glyphLayerOps'
import {
  findNode,
  findPath,
  generateId,
  getGlyphXBounds,
  isOffCurveNode,
  isPathEndpointNode,
  setNodeType,
  translateGlyphHorizontally,
  recomputeGlyphSidebearings,
  wouldCreateComponentCycle,
} from 'src/store/glyphGeometry'
import {
  clampEditorCursorIndex,
  syncEditorTextFromGlyphIds,
} from 'src/store/editorLine'
import { syncFilteredGlyphList } from 'src/store/glyphSearch'
import {
  activeLayer,
  ensureLoadedActiveLayer,
  getGlyphLayer,
  setGlyphActiveLayer,
} from 'src/store/glyphLayer'
import {
  markGlyphAdded,
  markGlyphDeleted,
  markGlyphDirty,
  markUiStateDirty,
} from 'src/store/dirtyState'

type ImmerSet = Parameters<
  StateCreator<GlobalState, [['zustand/immer', never]], []>
>[0]

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// Backup layer base name, e.g. "16 Jun, 25 17:08". Same-minute clashes are
// disambiguated downstream (glyphLayerOps).
const backupLayerName = (): string => {
  const now = new Date()
  const day = now.getDate()
  const month = MONTHS[now.getMonth()]
  const year = String(now.getFullYear()).slice(-2)
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${day} ${month}, ${year} ${hours}:${minutes}`
}

const renameGlyphSelector = (
  selector: GlyphSelector,
  oldGlyphId: string,
  newGlyphId: string
): GlyphSelector =>
  selector.kind === 'glyph' && selector.glyph === oldGlyphId
    ? { ...selector, glyph: newGlyphId }
    : selector

const renameGlyphReferences = (
  fontData: FontData,
  oldGlyphId: string,
  newGlyphId: string
) => {
  for (const glyph of Object.values(fontData.glyphs)) {
    for (const layer of Object.values(glyph.layers ?? {})) {
      for (const componentRef of layer.componentRefs) {
        if (componentRef.glyphId === oldGlyphId) {
          componentRef.glyphId = newGlyphId
        }
      }
      for (const componentRef of layer.background?.componentRefs ?? []) {
        if (componentRef.glyphId === oldGlyphId) {
          componentRef.glyphId = newGlyphId
        }
      }
    }

    if (glyph.leftMetricsKey === oldGlyphId) {
      glyph.leftMetricsKey = newGlyphId
    }
    if (glyph.rightMetricsKey === oldGlyphId) {
      glyph.rightMetricsKey = newGlyphId
    }
    if (glyph.widthMetricsKey === oldGlyphId) {
      glyph.widthMetricsKey = newGlyphId
    }
  }

  for (const group of fontData.kerningGroups ?? []) {
    group.glyphs = group.glyphs.map((glyphId) =>
      glyphId === oldGlyphId ? newGlyphId : glyphId
    )
  }

  for (const pair of fontData.kerningPairs ?? []) {
    pair.left = renameGlyphSelector(pair.left, oldGlyphId, newGlyphId)
    pair.right = renameGlyphSelector(pair.right, oldGlyphId, newGlyphId)
  }
}

const createRenamedGlyph = (
  glyph: GlyphData,
  oldGlyphId: string,
  newGlyphId: string
): GlyphData => ({
  ...glyph,
  id: newGlyphId,
  name: glyph.name === oldGlyphId ? newGlyphId : glyph.name,
})

export const buildGlyphActions = (set: ImmerSet) => ({
  deleteGlyph: (glyphId: string) =>
    set((state) => {
      if (!state.fontData?.glyphs[glyphId]) {
        return
      }

      delete state.fontData.glyphs[glyphId]
      if (state.fontData.glyphOrder) {
        state.fontData.glyphOrder = state.fontData.glyphOrder.filter(
          (id) => id !== glyphId
        )
      }
      state.editorGlyphIds = state.editorGlyphIds.filter((id) => id !== glyphId)
      syncEditorTextFromGlyphIds(state)
      state.editorTextCursorIndex = clampEditorCursorIndex(
        state,
        state.editorTextCursorIndex
      )
      if (state.selectedGlyphId === glyphId) {
        const fallbackGlyphId =
          state.editorGlyphIds[Math.max(0, state.editorTextCursorIndex - 1)] ??
          state.editorGlyphIds[0] ??
          Object.keys(state.fontData.glyphs)[0] ??
          null
        state.selectedGlyphId = fallbackGlyphId
        state.editorActiveGlyphIndex = state.editorGlyphIds.indexOf(
          fallbackGlyphId ?? ''
        )
        if (state.editorActiveGlyphIndex < 0) {
          state.editorActiveGlyphIndex = 0
        }
      }
      state.selectedNodeIds = []
      state.selectedSegment = null
      markGlyphDeleted(state, glyphId)
      syncFilteredGlyphList(state)
    }),

  renameGlyph: (oldGlyphId: string, newGlyphId: string) => {
    let renamed = false
    set((state) => {
      const fontData = state.fontData
      const glyph = fontData?.glyphs[oldGlyphId]
      const trimmedNewGlyphId = newGlyphId.trim()
      if (
        !fontData ||
        !glyph ||
        !trimmedNewGlyphId ||
        oldGlyphId === trimmedNewGlyphId ||
        fontData.glyphs[trimmedNewGlyphId]
      ) {
        return
      }

      const renamedGlyph = createRenamedGlyph(
        current(glyph),
        oldGlyphId,
        trimmedNewGlyphId
      )
      delete fontData.glyphs[oldGlyphId]
      fontData.glyphs[trimmedNewGlyphId] = renamedGlyph
      fontData.glyphOrder = (
        fontData.glyphOrder ?? Object.keys(fontData.glyphs)
      )
        .filter((glyphId) => glyphId !== trimmedNewGlyphId)
        .map((glyphId) =>
          glyphId === oldGlyphId ? trimmedNewGlyphId : glyphId
        )
      if (!fontData.glyphOrder.includes(trimmedNewGlyphId)) {
        fontData.glyphOrder.push(trimmedNewGlyphId)
      }

      renameGlyphReferences(fontData, oldGlyphId, trimmedNewGlyphId)
      state.editorGlyphIds = state.editorGlyphIds.map((glyphId) =>
        glyphId === oldGlyphId ? trimmedNewGlyphId : glyphId
      )
      syncEditorTextFromGlyphIds(state)
      if (state.selectedGlyphId === oldGlyphId) {
        state.selectedGlyphId = trimmedNewGlyphId
      }
      markGlyphDeleted(state, oldGlyphId)
      markGlyphAdded(state, trimmedNewGlyphId)
      syncFilteredGlyphList(state)
      renamed = true
    })
    return renamed
  },

  addGlyphs: (
    glyphs: Array<{
      id: string
      name: string
      unicode: string | null
      production?: string | null
      width?: number
    }>
  ) => {
    const addedGlyphIds: string[] = []
    set((state) => {
      if (!state.fontData || glyphs.length === 0) {
        return
      }

      const firstLoadedLayer = Object.values(state.fontData.glyphs)
        .map((glyph) => getGlyphLayer(glyph, null))
        .find(Boolean)
      const defaultWidth =
        firstLoadedLayer?.metrics.width ?? state.fontData.unitsPerEm ?? 1000

      for (const glyphInput of glyphs) {
        if (state.fontData.glyphs[glyphInput.id]) {
          continue
        }

        const width = glyphInput.width ?? defaultWidth
        const layerId = state.selectedLayerId ?? 'public.default'
        state.fontData.glyphOrder =
          state.fontData.glyphOrder ?? Object.keys(state.fontData.glyphs)
        state.fontData.glyphs[glyphInput.id] = {
          id: glyphInput.id,
          name: glyphInput.name,
          unicodes: glyphInput.unicode ? [glyphInput.unicode] : [],
          production: glyphInput.production ?? null,
          activeLayerId: layerId,
          layerOrder: [layerId],
          layers: {
            [layerId]: {
              id: layerId,
              name: layerId,
              type: 'master',
              associatedMasterId: layerId,
              paths: [],
              componentRefs: [],
              anchors: [],
              guidelines: [],
              metrics: { width, lsb: 0, rsb: width },
            },
          },
        }
        if (!state.fontData.glyphOrder.includes(glyphInput.id)) {
          state.fontData.glyphOrder.push(glyphInput.id)
        }
        addedGlyphIds.push(glyphInput.id)
      }

      if (addedGlyphIds.length === 0) {
        return
      }

      for (const glyphId of addedGlyphIds) {
        markGlyphAdded(state, glyphId)
      }
      syncFilteredGlyphList(state)
      state.selectedGlyphId = addedGlyphIds[0] ?? state.selectedGlyphId
    })
    return addedGlyphIds
  },

  addComponentRef: (glyphId: string, componentGlyphId: string) => {
    let added = false
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const componentGlyph = state.fontData?.glyphs[componentGlyphId]
      if (!glyph || !componentGlyph || !state.fontData) {
        return
      }
      if (
        wouldCreateComponentCycle(
          state.fontData.glyphs,
          glyphId,
          componentGlyphId
        )
      ) {
        return
      }

      const layer = ensureLoadedActiveLayer(glyph)
      if (!layer) {
        return
      }
      layer.componentRefs.push({
        id: generateId('component'),
        glyphId: componentGlyphId,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      })
      markGlyphDirty(state, glyphId)
      added = true
    })
    return added
  },

  setSelectedLayerId: (id: string | null, clearTemporal: () => void) =>
    set((state) => {
      state.selectedLayerId = id
      state.selectedNodeIds = []
      state.selectedSegment = null
      if (state.selectedGlyphId) {
        setGlyphActiveLayer(
          state.fontData?.glyphs[state.selectedGlyphId],
          state.selectedLayerId
        )
      }
      markUiStateDirty(state)
      clearTemporal()
    }),

  // Switching master is font-wide; it converges selectedLayerId onto the master
  // (layers are keyed by source id) so overview and editor both follow, and
  // snaps editLocation to the source location (VF generalises this to any point).
  setActiveMasterId: (id: string | null, clearTemporal: () => void) =>
    set((state) => {
      state.activeMasterId = id
      const source = id ? state.fontData?.sources?.[id] : null
      state.editLocation = source ? { ...source.location } : {}
      if (id) {
        state.selectedLayerId = id
        state.selectedNodeIds = []
        state.selectedSegment = null
        if (state.selectedGlyphId) {
          setGlyphActiveLayer(state.fontData?.glyphs[state.selectedGlyphId], id)
        }
      }
      markUiStateDirty(state)
      clearTemporal()
    }),

  setEditLocation: (
    location: Record<string, number>,
    clearTemporal: () => void
  ) =>
    set((state) => {
      const nextLocation = { ...location }
      const sourceId = findSourceIdAtLocation(state.fontData, nextLocation)
      state.editLocation = nextLocation
      state.activeMasterId = sourceId
      state.selectedNodeIds = []
      state.selectedSegment = null
      if (sourceId) {
        state.selectedLayerId = sourceId
        if (state.selectedGlyphId) {
          setGlyphActiveLayer(
            state.fontData?.glyphs[state.selectedGlyphId],
            sourceId
          )
        }
      }
      markUiStateDirty(state)
      clearTemporal()
    }),

  updateNodePosition: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    newPos: { x: number; y: number }
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const layer = ensureLoadedActiveLayer(glyph)
      if (!layer) {
        return
      }

      const node = findNode(findPath(layer, pathId), nodeId)
      if (!node) {
        return
      }

      node.x = Math.round(newPos.x)
      node.y = Math.round(newPos.y)
      recomputeGlyphSidebearings(layer)
      markGlyphDirty(state, glyphId)
    }),

  updateNodePositions: (
    glyphId: string,
    updates: Array<{
      pathId: string
      nodeId: string
      newPos: { x: number; y: number }
    }>
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const layer = ensureLoadedActiveLayer(glyph)
      if (!layer) {
        return
      }

      for (const update of updates) {
        const node = findNode(findPath(layer, update.pathId), update.nodeId)
        if (!node) {
          continue
        }

        node.x = Math.round(update.newPos.x)
        node.y = Math.round(update.newPos.y)
      }
      recomputeGlyphSidebearings(layer)
      markGlyphDirty(state, glyphId)
    }),

  applyBatchNodePositions: (
    batch: Array<{
      glyphId: string
      updates: Array<{
        pathId: string
        nodeId: string
        newPos: { x: number; y: number }
      }>
    }>
  ) =>
    set((state) => {
      for (const { glyphId, updates } of batch) {
        const glyph = state.fontData?.glyphs[glyphId]
        if (!glyph) {
          continue
        }
        const layer = ensureLoadedActiveLayer(glyph)
        if (!layer) {
          continue
        }

        for (const update of updates) {
          const node = findNode(findPath(layer, update.pathId), update.nodeId)
          if (!node) {
            continue
          }

          node.x = Math.round(update.newPos.x)
          node.y = Math.round(update.newPos.y)
        }
        recomputeGlyphSidebearings(layer)
        markGlyphDirty(state, glyphId)
      }
      // Rebuild the overview list so the glyph grid re-renders with the
      // transformed shapes; it holds glyph references that node mutations
      // would otherwise leave stale.
      syncFilteredGlyphList(state)
    }),

  updateNodeType: (
    glyphId: string,
    pathId: string,
    nodeId: string,
    type: OnCurveNodeType
  ) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const layer = ensureLoadedActiveLayer(glyph)
      if (!layer) {
        return
      }

      const path = findPath(layer, pathId)
      const node = findNode(path, nodeId)
      if (node) {
        if (isOffCurveNode(node)) {
          return
        }

        if (type === 'smooth' && path && isPathEndpointNode(path, nodeId)) {
          node.smooth = false
          return
        }

        setNodeType(node, type)
        markGlyphDirty(state, glyphId)
      }
    }),

  updateGlyphMetrics: (glyphId: string, metrics: Partial<GlyphMetrics>) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph) {
        return
      }
      const layer = ensureLoadedActiveLayer(glyph)
      if (!layer) {
        return
      }

      if (typeof metrics.lsb === 'number') {
        const nextLsb = Math.round(metrics.lsb)
        const deltaX = nextLsb - layer.metrics.lsb
        translateGlyphHorizontally(layer, deltaX)
        layer.metrics.width = Math.max(
          0,
          Math.round(layer.metrics.width + deltaX)
        )
        layer.metrics.lsb = nextLsb
      }

      if (typeof metrics.width === 'number') {
        layer.metrics.width = Math.max(0, Math.round(metrics.width))
        const bounds = getGlyphXBounds(layer)
        layer.metrics.rsb = Math.round(
          layer.metrics.width - (bounds?.xMax ?? 0)
        )
      }

      if (typeof metrics.rsb === 'number') {
        const nextRsb = Math.round(metrics.rsb)
        const bounds = getGlyphXBounds(layer)
        layer.metrics.width = Math.max(
          0,
          Math.round((bounds?.xMax ?? 0) + nextRsb)
        )
        layer.metrics.rsb = nextRsb
      }

      markGlyphDirty(state, glyphId)
    }),

  createBackupLayer: (glyphId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph?.layers) {
        return
      }
      state.fontData!.glyphs[glyphId] = createBackupLayer(
        current(glyph),
        backupLayerName()
      )
      markGlyphDirty(state, glyphId)
    }),

  // Fill a sparse master: create the missing master layer for this glyph,
  // seeded from its current active layer so it starts as an editable copy.
  createGlyphMasterLayer: (glyphId: string, masterId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      const source = state.fontData?.sources?.[masterId]
      if (!glyph?.layers || !source || glyph.layers[masterId]) {
        return
      }
      const base = activeLayer(current(glyph))
      glyph.layers = glyph.layers ?? {}
      glyph.layers[masterId] = {
        id: masterId,
        name: source.name,
        type: 'master',
        associatedMasterId: masterId,
        paths: structuredClone(base.paths),
        componentRefs: structuredClone(base.componentRefs),
        anchors: structuredClone(base.anchors ?? []),
        guidelines: structuredClone(base.guidelines ?? []),
        metrics: structuredClone(base.metrics),
      }
      glyph.layerOrder = [...(glyph.layerOrder ?? []), masterId]
      markGlyphDirty(state, glyphId)
    }),

  duplicateLayer: (glyphId: string, layerId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph?.layers) {
        return
      }
      const sourceName = glyph.layers?.[layerId]?.name ?? 'Master'
      state.fontData!.glyphs[glyphId] = duplicateLayer(
        current(glyph),
        layerId,
        `${sourceName} copy`
      )
      markGlyphDirty(state, glyphId)
    }),

  deleteBackupLayer: (glyphId: string, layerId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph?.layers) {
        return
      }
      const nextGlyph = deleteBackupLayer(current(glyph), layerId)
      state.fontData!.glyphs[glyphId] = nextGlyph
      if (state.selectedLayerId === layerId) {
        state.selectedLayerId = nextGlyph.activeLayerId ?? null
      }
      markGlyphDirty(state, glyphId)
    }),

  renameBackupLayer: (glyphId: string, layerId: string, name: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph?.layers) {
        return
      }
      const nextGlyph = renameBackupLayer(current(glyph), layerId, name)
      state.fontData!.glyphs[glyphId] = nextGlyph
      if (state.selectedLayerId === layerId) {
        state.selectedLayerId = nextGlyph.activeLayerId ?? null
      }
      markGlyphDirty(state, glyphId)
    }),

  promoteBackupToMaster: (glyphId: string, layerId: string) =>
    set((state) => {
      const glyph = state.fontData?.glyphs[glyphId]
      if (!glyph?.layers) {
        return
      }
      const nextGlyph = promoteBackupToMaster(
        current(glyph),
        layerId,
        backupLayerName()
      )
      state.fontData!.glyphs[glyphId] = nextGlyph
      if (state.selectedLayerId === layerId) {
        state.selectedLayerId = nextGlyph.activeLayerId ?? null
      }
      state.selectedNodeIds = []
      state.selectedSegment = null
      markGlyphDirty(state, glyphId)
    }),
})
