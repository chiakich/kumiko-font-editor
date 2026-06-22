import type {
  FontData,
  GlobalState,
  OverviewSearchOptionsState,
} from 'src/store/types'
import {
  DEFAULT_OVERVIEW_SEARCH_FIELDS,
  filterGlyphsByOverviewSearch,
} from 'src/lib/glyph/glyphOverview'

export const DEFAULT_OVERVIEW_SEARCH_OPTIONS = {
  fields: DEFAULT_OVERVIEW_SEARCH_FIELDS,
  matchCase: false,
  regex: false,
} satisfies OverviewSearchOptionsState

export const IDS_DICTIONARY: Record<string, string[]> = {
  林: ['木', '木'],
  森: ['木', '木', '木'],
  果: ['日', '木'],
  樹: ['木', '尌'],
  機: ['木', '幾'],
}

const getGlyphs = (fontData: FontData | null) =>
  Object.values(fontData?.glyphs ?? {})

const filterGlyphs = (
  fontData: FontData | null,
  query: string,
  idsDictionary: Record<string, string[]>,
  searchOptions: OverviewSearchOptionsState
) => {
  const glyphs = getGlyphs(fontData)
  return filterGlyphsByOverviewSearch(
    glyphs,
    {
      fields:
        searchOptions.fields.length > 0
          ? searchOptions.fields
          : DEFAULT_OVERVIEW_SEARCH_OPTIONS.fields,
      matchCase: searchOptions.matchCase,
      query,
      regex: searchOptions.regex,
    },
    idsDictionary
  )
}

export const syncFilteredGlyphList = (state: GlobalState) => {
  const stateSearchOptions =
    state.overviewSearchOptions ?? DEFAULT_OVERVIEW_SEARCH_OPTIONS
  state.filteredGlyphList = filterGlyphs(
    state.fontData,
    state.currentSearchQuery,
    state.idsDictionary,
    stateSearchOptions
  )
}
