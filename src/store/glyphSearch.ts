import type { FontData, GlyphData, GlobalState } from 'src/store/types'

export const IDS_DICTIONARY: Record<string, string[]> = {
  林: ['木', '木'],
  森: ['木', '木', '木'],
  果: ['日', '木'],
  樹: ['木', '尌'],
  機: ['木', '幾'],
}

const getGlyphs = (fontData: FontData | null) =>
  Object.values(fontData?.glyphs ?? {})

const matchesIdsSearch = (
  glyph: GlyphData,
  query: string,
  idsDictionary: Record<string, string[]>
) => {
  const directIds = idsDictionary[glyph.name] ?? []
  return directIds.some((component) => component.toLowerCase().includes(query))
}

const filterGlyphs = (
  fontData: FontData | null,
  query: string,
  idsDictionary: Record<string, string[]>
) => {
  const glyphs = getGlyphs(fontData)
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return glyphs
  }

  return glyphs.filter((glyph) => {
    return (
      glyph.name.toLowerCase().includes(normalizedQuery) ||
      glyph.id.toLowerCase().includes(normalizedQuery) ||
      glyph.components.some((component) =>
        component.toLowerCase().includes(normalizedQuery)
      ) ||
      matchesIdsSearch(glyph, normalizedQuery, idsDictionary)
    )
  })
}

export const syncFilteredGlyphList = (state: GlobalState) => {
  state.filteredGlyphList = filterGlyphs(
    state.fontData,
    state.currentSearchQuery,
    state.idsDictionary
  )
}
