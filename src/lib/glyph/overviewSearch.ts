import { getGlyphComponentGlyphIds } from '@/domain/glyphGeometryState'
import { getGlyphUnicodes } from '@/lib/glyph/glyphUnicode'
import { unicodeHexToCharacter } from '@/lib/project/unicode'
import {
  DEFAULT_OVERVIEW_SEARCH_FIELDS,
  type OverviewSearchField,
  type OverviewSearchModel,
} from '@/lib/glyph/overviewTypes'
import type { GlyphData } from '@/domain'

export const normalizeSearchText = (value: string, matchCase: boolean) =>
  matchCase ? value : value.toLocaleLowerCase()

const getCharacterSearchAliases = (query: string) => {
  const characters = Array.from(query)
  if (characters.length !== 1) {
    return []
  }

  const codePoint = characters[0]?.codePointAt(0)
  if (codePoint === undefined) {
    return []
  }

  const unicode = codePoint.toString(16).toUpperCase().padStart(4, '0')
  return [
    unicode,
    `U+${unicode}`,
    codePoint <= 0xffff ? `uni${unicode}` : `u${unicode}`,
  ]
}

const getSearchNeedles = (query: string, matchCase: boolean) =>
  [query, ...getCharacterSearchAliases(query)].map((value) =>
    normalizeSearchText(value, matchCase)
  )

export const compact = <T>(values: Array<T | null | undefined | false>): T[] =>
  values.filter((value): value is T => Boolean(value))

const getOverviewSearchTargets = (
  glyph: GlyphData,
  fields: OverviewSearchField[],
  idsDictionary: Record<string, string[]>
) => {
  const fieldSet = new Set(fields)
  const unicodes = getGlyphUnicodes(glyph)

  return [
    ...(fieldSet.has('glyphName')
      ? compact([glyph.id, glyph.name, glyph.displayName, glyph.production])
      : []),
    ...(fieldSet.has('unicodeValue')
      ? unicodes.flatMap((unicode) => [unicode, `U+${unicode}`])
      : []),
    ...(fieldSet.has('unicodeCharacter')
      ? compact(unicodes.map((unicode) => unicodeHexToCharacter(unicode)))
      : []),
    ...(fieldSet.has('note') ? compact([glyph.note]) : []),
    ...(fieldSet.has('component') ? getGlyphComponentGlyphIds(glyph) : []),
    ...(fieldSet.has('ids') ? (idsDictionary[glyph.name] ?? []) : []),
  ]
}

export const createOverviewSearchMatcher = (
  model: OverviewSearchModel,
  idsDictionary: Record<string, string[]> = {}
) => {
  const query = model.query.trim()
  if (!query) {
    return () => true
  }

  const fields = model.fields?.length
    ? model.fields
    : DEFAULT_OVERVIEW_SEARCH_FIELDS
  const matchCase = Boolean(model.matchCase)

  if (model.regex) {
    try {
      const regex = new RegExp(query, matchCase ? 'u' : 'iu')
      return (glyph: GlyphData) =>
        getOverviewSearchTargets(glyph, fields, idsDictionary).some((target) =>
          regex.test(target)
        )
    } catch {
      return () => false
    }
  }

  const needles = getSearchNeedles(query, matchCase)
  return (glyph: GlyphData) =>
    getOverviewSearchTargets(glyph, fields, idsDictionary).some((target) =>
      needles.some((needle) =>
        normalizeSearchText(target, matchCase).includes(needle)
      )
    )
}

export const filterGlyphsByOverviewSearch = (
  glyphs: GlyphData[],
  model: OverviewSearchModel,
  idsDictionary: Record<string, string[]> = {}
) => {
  const matcher = createOverviewSearchMatcher(model, idsDictionary)
  return glyphs.filter(matcher)
}
