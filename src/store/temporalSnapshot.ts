import { isGlyphGeometryLoaded } from '@/domain/glyphGeometryState'
import { getGlyphLayer } from '@/domain/glyphLayer'
import type { FontData, GlyphData } from '@/domain'
import type { GlobalState } from '@/store/types'

type TemporalTrackedState = Pick<GlobalState, 'fontData'>

const temporalSnapshotCache = new WeakMap<
  FontData,
  { geometryKey: string; snapshot: FontData }
>()
const temporalSnapshotSources = new WeakMap<FontData, FontData>()

const stripGlyphGeometry = (glyph: GlyphData): GlyphData => {
  if (!isGlyphGeometryLoaded(glyph)) {
    return glyph
  }

  const stripped = { ...glyph }
  delete stripped.layers
  stripped.activeLayerId = null
  return stripped
}

const addGlyphGeometryClosure = (
  fontData: FontData | null,
  target: Set<string>,
  glyphIds: Iterable<string>,
  visited = new Set<string>()
) => {
  if (!fontData) {
    return
  }

  for (const glyphId of glyphIds) {
    if (visited.has(glyphId)) {
      continue
    }
    visited.add(glyphId)

    const glyph = fontData.glyphs[glyphId]
    if (!glyph) {
      continue
    }

    target.add(glyphId)
    const layer = getGlyphLayer(glyph, null)
    addGlyphGeometryClosure(
      fontData,
      target,
      [
        ...(layer?.componentRefs ?? []),
        ...(layer?.background?.componentRefs ?? []),
      ].map((componentRef) => componentRef.glyphId),
      visited
    )
  }
}

const getTemporalGeometryGlyphIds = (state: GlobalState) => {
  const glyphIds = new Set<string>()

  for (const glyphId of state.editorGlyphIds) {
    glyphIds.add(glyphId)
  }
  for (const glyphId of state.editorReferenceGlyphIds) {
    glyphIds.add(glyphId)
  }
  for (const glyphId of state.dirtyGlyphIds) {
    glyphIds.add(glyphId)
  }
  for (const glyphId of state.localDirtyGlyphIds) {
    glyphIds.add(glyphId)
  }
  for (const glyphId of state.persistenceQueue.glyphIds) {
    glyphIds.add(glyphId)
  }
  if (state.selectedGlyphId) {
    glyphIds.add(state.selectedGlyphId)
  }
  addGlyphGeometryClosure(state.fontData, glyphIds, [...glyphIds])

  return glyphIds
}

const getTemporalGeometryKey = (glyphIds: Set<string>) =>
  [...glyphIds].sort().join('\0')

export const createTemporalFontDataSnapshot = (
  fontData: FontData,
  geometryGlyphIds: Set<string>
): FontData => {
  const glyphs: FontData['glyphs'] = {}

  for (const [glyphId, glyph] of Object.entries(fontData.glyphs)) {
    glyphs[glyphId] = geometryGlyphIds.has(glyphId)
      ? glyph
      : stripGlyphGeometry(glyph)
  }

  return {
    ...fontData,
    glyphs,
  }
}

const getTemporalFontDataSnapshot = (
  fontData: FontData,
  geometryGlyphIds: Set<string>
) => {
  const geometryKey = getTemporalGeometryKey(geometryGlyphIds)
  const cached = temporalSnapshotCache.get(fontData)
  if (cached?.geometryKey === geometryKey) {
    return cached.snapshot
  }

  const snapshot = createTemporalFontDataSnapshot(fontData, geometryGlyphIds)
  temporalSnapshotCache.set(fontData, { geometryKey, snapshot })
  temporalSnapshotSources.set(snapshot, fontData)
  return snapshot
}

const getTemporalFontDataSource = (fontData: FontData) =>
  temporalSnapshotSources.get(fontData) ?? fontData

export const areTemporalTrackedStatesEqual = (
  pastState: TemporalTrackedState,
  currentState: TemporalTrackedState
) =>
  pastState.fontData === currentState.fontData ||
  !pastState.fontData ||
  !currentState.fontData ||
  getTemporalFontDataSource(pastState.fontData) ===
    getTemporalFontDataSource(currentState.fontData)

export const partializeTemporalState = (
  state: GlobalState
): TemporalTrackedState => ({
  fontData: state.fontData
    ? getTemporalFontDataSnapshot(
        state.fontData,
        getTemporalGeometryGlyphIds(state)
      )
    : null,
})
