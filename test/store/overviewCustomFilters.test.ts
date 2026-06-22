import { afterEach, describe, expect, it } from 'vitest'
import {
  createDefaultOverviewCustomFilters,
  type OverviewCustomFilter,
} from 'src/lib/glyph/glyphOverview'
import {
  loadAppOverviewCustomFilters,
  saveAppOverviewCustomFilters,
} from 'src/lib/preferences/appPreferences'
import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'
import { useStore, type FontData } from 'src/store'

const fontData: FontData = {
  glyphOrder: ['A'],
  glyphs: {
    A: {
      id: 'A',
      name: 'A',
      unicodes: ['0041'],
      activeLayerId: 'public.default',
      layerOrder: ['public.default'],
      layers: {
        'public.default': {
          id: 'public.default',
          name: 'public.default',
          type: 'master',
          associatedMasterId: 'public.default',
          paths: [],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { width: 500, lsb: 0, rsb: 500 },
        },
      },
    },
  },
}

const filterIds = () =>
  useStore.getState().overviewCustomFilters.map((filter) => filter.id)

const createMemoryStorage = () => {
  const records = new Map<string, string>()
  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
}

describe('overview custom filter app preferences', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
    useStore.setState({
      overviewCustomFilters: createDefaultOverviewCustomFilters(),
    })
  })

  it('loads seeded editable filters when no app preference exists', () => {
    expect(
      loadAppOverviewCustomFilters(createMemoryStorage()).map(
        (filter) => filter.id
      )
    ).toEqual(createDefaultOverviewCustomFilters().map((filter) => filter.id))
  })

  it('keeps a saved empty app filter list empty', () => {
    const storage = createMemoryStorage()

    saveAppOverviewCustomFilters([], storage)

    expect(loadAppOverviewCustomFilters(storage)).toEqual([])
  })

  it('drops obsolete seeded app filters while keeping current seeds', () => {
    const storage = createMemoryStorage()
    const obsoleteSeededFilter: OverviewCustomFilter = {
      id: 'seeded:exporting',
      mode: 'all',
      name: 'Exporting',
      rules: [
        {
          field: 'export',
          id: 'export-is-true',
          operator: 'is',
          value: 'true',
        },
      ],
      source: 'seeded',
      sort: 'codePoint',
    }

    saveAppOverviewCustomFilters(
      [...createDefaultOverviewCustomFilters(), obsoleteSeededFilter],
      storage
    )

    expect(
      loadAppOverviewCustomFilters(storage).map((filter) => filter.id)
    ).toEqual(createDefaultOverviewCustomFilters().map((filter) => filter.id))
  })

  it('does not hydrate filters from project UI state', () => {
    useStore.setState({ overviewCustomFilters: [] })
    const legacyProjectUiState = {
      overviewCustomFilters: createDefaultOverviewCustomFilters(),
    } as unknown as KumikoProjectUiState

    useStore
      .getState()
      .loadProjectState(
        'project-a',
        'Project A',
        fontData,
        null,
        null,
        null,
        legacyProjectUiState
      )

    expect(filterIds()).toEqual([])
  })

  it('keeps app filters when loading and closing projects', () => {
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    expect(filterIds()).toEqual(
      createDefaultOverviewCustomFilters().map((filter) => filter.id)
    )
    expect(useStore.getState().overviewCustomFilters[0]).toMatchObject({
      id: 'seeded:recent-edits',
      source: 'seeded',
      sort: 'recentEdit',
    })
    useStore.getState().closeProjectState()

    expect(filterIds()).toEqual(
      createDefaultOverviewCustomFilters().map((filter) => filter.id)
    )
  })

  it('does not mark the project dirty when app filters change', () => {
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)
    const [firstFilter] = useStore.getState().overviewCustomFilters

    useStore.getState().deleteOverviewCustomFilter(firstFilter.id)

    expect(filterIds()).not.toContain(firstFilter.id)
    expect(useStore.getState().isDirty).toBe(false)
    expect(useStore.getState().persistenceQueue.uiStateQueued).toBe(false)
  })
})
