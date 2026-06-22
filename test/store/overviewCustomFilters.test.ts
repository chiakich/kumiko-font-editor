import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultOverviewCustomFilters } from 'src/lib/glyph/glyphOverview'
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

describe('overview custom filter seeding', () => {
  afterEach(() => {
    useStore.getState().closeProjectState()
  })

  it('seeds default editable filters when a project has no saved filter state', () => {
    useStore.getState().loadProjectState('project-a', 'Project A', fontData)

    expect(filterIds()).toEqual(
      createDefaultOverviewCustomFilters().map((filter) => filter.id)
    )
    expect(useStore.getState().overviewCustomFilters[0]).toMatchObject({
      id: 'seeded:recent-edits',
      source: 'seeded',
      sort: 'recentEdit',
    })
  })

  it('keeps a saved empty filter list empty so deleted seeds stay deleted', () => {
    useStore
      .getState()
      .loadProjectState('project-a', 'Project A', fontData, null, null, null, {
        overviewCustomFilters: [],
      })

    expect(filterIds()).toEqual([])
  })
})
