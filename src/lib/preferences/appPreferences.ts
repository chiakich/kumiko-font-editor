import { useSyncExternalStore } from 'react'
import {
  createDefaultOverviewCustomFilters,
  normalizeOverviewCustomFilters,
  type OverviewCustomFilter,
} from 'src/lib/glyph/glyphOverview'

const OVERVIEW_CUSTOM_FILTERS_STORAGE_KEY =
  'kumiko.app.overviewCustomFilters.v1'
const GLYPH_COLOR_LABEL_DISPLAY_MODE_STORAGE_KEY =
  'kumiko.app.glyphColorLabelDisplayMode.v1'
export type GlyphColorLabelDisplayMode = 'card' | 'dot'

const DEFAULT_GLYPH_COLOR_LABEL_DISPLAY_MODE: GlyphColorLabelDisplayMode =
  'card'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const getLocalStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const currentSeededFilterIds = () =>
  new Set(createDefaultOverviewCustomFilters().map((filter) => filter.id))

const migrateAppOverviewCustomFilters = (filters: OverviewCustomFilter[]) => {
  const seededFilterIds = currentSeededFilterIds()
  return filters.filter(
    (filter) => filter.source !== 'seeded' || seededFilterIds.has(filter.id)
  )
}

export const loadAppOverviewCustomFilters = (
  storage: StorageLike | null = getLocalStorage()
): OverviewCustomFilter[] => {
  if (!storage) {
    return createDefaultOverviewCustomFilters()
  }

  try {
    const rawFilters = storage.getItem(OVERVIEW_CUSTOM_FILTERS_STORAGE_KEY)
    if (rawFilters === null) {
      return createDefaultOverviewCustomFilters()
    }
    const parsedFilters = JSON.parse(rawFilters) as unknown
    if (!Array.isArray(parsedFilters)) {
      return createDefaultOverviewCustomFilters()
    }
    const filters = migrateAppOverviewCustomFilters(
      normalizeOverviewCustomFilters(parsedFilters)
    )
    saveAppOverviewCustomFilters(filters, storage)
    return filters
  } catch {
    return createDefaultOverviewCustomFilters()
  }
}

export const saveAppOverviewCustomFilters = (
  filters: OverviewCustomFilter[],
  storage: StorageLike | null = getLocalStorage()
) => {
  const normalizedFilters = normalizeOverviewCustomFilters(filters)
  if (!storage) {
    return normalizedFilters
  }

  try {
    storage.setItem(
      OVERVIEW_CUSTOM_FILTERS_STORAGE_KEY,
      JSON.stringify(normalizedFilters)
    )
  } catch {
    // Keep runtime state usable even when browser storage is disabled or full.
  }
  return normalizedFilters
}

const glyphColorLabelDisplayModeListeners = new Set<() => void>()

const normalizeGlyphColorLabelDisplayMode = (
  value: string | null | undefined
): GlyphColorLabelDisplayMode =>
  value === 'dot' || value === 'card'
    ? value
    : DEFAULT_GLYPH_COLOR_LABEL_DISPLAY_MODE

export const loadGlyphColorLabelDisplayMode = (
  storage: StorageLike | null = getLocalStorage()
): GlyphColorLabelDisplayMode => {
  if (!storage) {
    return DEFAULT_GLYPH_COLOR_LABEL_DISPLAY_MODE
  }

  try {
    return normalizeGlyphColorLabelDisplayMode(
      storage.getItem(GLYPH_COLOR_LABEL_DISPLAY_MODE_STORAGE_KEY)
    )
  } catch {
    return DEFAULT_GLYPH_COLOR_LABEL_DISPLAY_MODE
  }
}

export const saveGlyphColorLabelDisplayMode = (
  mode: GlyphColorLabelDisplayMode,
  storage: StorageLike | null = getLocalStorage()
) => {
  const normalizedMode = normalizeGlyphColorLabelDisplayMode(mode)
  if (storage) {
    try {
      storage.setItem(
        GLYPH_COLOR_LABEL_DISPLAY_MODE_STORAGE_KEY,
        normalizedMode
      )
    } catch {
      // Keep the in-memory setting responsive even when storage is unavailable.
    }
  }
  glyphColorLabelDisplayModeListeners.forEach((listener) => listener())
  return normalizedMode
}

const subscribeGlyphColorLabelDisplayMode = (listener: () => void) => {
  glyphColorLabelDisplayModeListeners.add(listener)

  if (typeof window === 'undefined') {
    return () => {
      glyphColorLabelDisplayModeListeners.delete(listener)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === GLYPH_COLOR_LABEL_DISPLAY_MODE_STORAGE_KEY) {
      listener()
    }
  }
  window.addEventListener('storage', handleStorage)

  return () => {
    glyphColorLabelDisplayModeListeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
  }
}

export const useGlyphColorLabelDisplayMode = (): GlyphColorLabelDisplayMode =>
  useSyncExternalStore(
    subscribeGlyphColorLabelDisplayMode,
    () => loadGlyphColorLabelDisplayMode(),
    () => DEFAULT_GLYPH_COLOR_LABEL_DISPLAY_MODE
  )
