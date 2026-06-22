import {
  createDefaultOverviewCustomFilters,
  normalizeOverviewCustomFilters,
  type OverviewCustomFilter,
} from 'src/lib/glyph/glyphOverview'

const OVERVIEW_CUSTOM_FILTERS_STORAGE_KEY =
  'kumiko.app.overviewCustomFilters.v1'

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
