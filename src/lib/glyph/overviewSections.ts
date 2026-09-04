import type { GlyphEditTimes } from '@/lib/glyph/glyphEditTimes'
import {
  GLYPH_CATEGORY_DEFINITIONS,
  OTHER_CATEGORY,
  SCRIPT_RANGES,
  UNENCODED_CATEGORY,
  getCodePoint,
  getGlyphBlockLabel,
  getGlyphCategoryPath,
  getGlyphScriptLabel,
} from '@/lib/glyph/glyphCategories'
import {
  createDefaultOverviewCustomFilters,
  customOverviewFilterIdToNodeId,
  encodeFilterIdPart,
  matchesOverviewCustomFilter,
} from '@/lib/glyph/overviewCustomFilters'
import { normalizeOverviewCustomFilters } from '@/lib/glyph/overviewCustomFilterSchema'
import type {
  GlyphOverviewSection,
  GlyphOverviewTreeKind,
  GlyphOverviewTreeNode,
  OverviewCustomFilter,
  OverviewGroupBy,
} from '@/lib/glyph/overviewTypes'
import { activeLayer } from '@/domain/glyphLayer'
import type { GlyphData } from '@/domain'

const getGlyphSortKey = (glyph: GlyphData) => {
  const codePoint = getCodePoint(glyph)
  return codePoint === null ? glyph.id : codePoint.toString().padStart(8, '0')
}

const sortGlyphsByCodePoint = (glyphs: GlyphData[]) =>
  [...glyphs].sort((left, right) => {
    const leftCodePoint = getCodePoint(left)
    const rightCodePoint = getCodePoint(right)
    if (leftCodePoint !== null && rightCodePoint !== null) {
      return leftCodePoint - rightCodePoint
    }
    return getGlyphSortKey(left).localeCompare(getGlyphSortKey(right))
  })

const sortGlyphsByRecentEdit = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes
) =>
  [...glyphs].sort(
    (left, right) =>
      (glyphEditTimes[right.id] ?? 0) - (glyphEditTimes[left.id] ?? 0) ||
      left.id.localeCompare(right.id)
  )

const createSectionNode = (
  id: string,
  label: string,
  glyphs: GlyphData[],
  kind: GlyphOverviewTreeKind,
  children?: GlyphOverviewTreeNode[],
  labelKey?: string
): GlyphOverviewTreeNode => ({
  id,
  label,
  ...(labelKey ? { labelKey } : {}),
  glyphs,
  kind,
  ...(children ? { children } : {}),
})

const uniqueGlyphs = (glyphs: GlyphData[]) => {
  const ids = new Set<string>()
  const unique: GlyphData[] = []

  for (const glyph of glyphs) {
    if (ids.has(glyph.id)) {
      continue
    }
    ids.add(glyph.id)
    unique.push(glyph)
  }

  return unique
}

const buildCategoryNodes = (glyphs: GlyphData[]) => {
  const categoryMap = new Map<
    string,
    {
      glyphs: GlyphData[]
      subCategories: Map<string, GlyphData[]>
    }
  >()

  for (const glyph of glyphs) {
    const { category, subCategory } = getGlyphCategoryPath(glyph)
    const categoryRecord =
      categoryMap.get(category) ??
      (() => {
        const next = {
          glyphs: [],
          subCategories: new Map<string, GlyphData[]>(),
        }
        categoryMap.set(category, next)
        return next
      })()

    categoryRecord.glyphs.push(glyph)
    if (subCategory) {
      const subCategoryGlyphs = categoryRecord.subCategories.get(subCategory)
      if (subCategoryGlyphs) {
        subCategoryGlyphs.push(glyph)
      } else {
        categoryRecord.subCategories.set(subCategory, [glyph])
      }
    }
  }

  const preferredOrder = [
    ...GLYPH_CATEGORY_DEFINITIONS.map((definition) => definition.label),
    OTHER_CATEGORY.label,
    UNENCODED_CATEGORY.label,
  ]

  return [...categoryMap.entries()]
    .sort(([left], [right]) => {
      const leftIndex = preferredOrder.indexOf(left)
      const rightIndex = preferredOrder.indexOf(right)
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (
          (leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER) -
          (rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER)
        )
      }
      return left.localeCompare(right)
    })
    .map(([category, record]) => {
      const categoryGlyphs = record.glyphs
      const children = [...record.subCategories.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([subCategory, subCategoryGlyphs]) =>
          createSectionNode(
            `category:${encodeFilterIdPart(category)}/${encodeFilterIdPart(
              subCategory
            )}`,
            subCategory,
            subCategoryGlyphs,
            'category'
          )
        )

      return createSectionNode(
        `category:${encodeFilterIdPart(category)}`,
        category,
        categoryGlyphs,
        'category',
        children.length ? children : undefined
      )
    })
}

const buildLanguageNodes = (glyphs: GlyphData[]) => {
  const scriptMap = new Map<string, GlyphData[]>()
  for (const glyph of glyphs) {
    const label = getGlyphScriptLabel(glyph)
    const scriptGlyphs = scriptMap.get(label)
    if (scriptGlyphs) {
      scriptGlyphs.push(glyph)
    } else {
      scriptMap.set(label, [glyph])
    }
  }

  const labelsByOrder = [
    ...SCRIPT_RANGES.map((range) => range.label),
    'Other',
    'Unencoded',
  ]
  return labelsByOrder
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .map((label) => {
      const scriptGlyphs = scriptMap.get(label) ?? []
      return createSectionNode(
        `script:${label}`,
        label,
        scriptGlyphs,
        'language'
      )
    })
    .filter((node) => node.glyphs.length > 0)
}

const buildFilterNodes = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes,
  customFilters: OverviewCustomFilter[]
) => {
  return customFilters.map((filter) => {
    const filterGlyphs = glyphs.filter((glyph) =>
      matchesOverviewCustomFilter(glyph, filter, glyphEditTimes)
    )
    const sortedGlyphs =
      filter.sort === 'recentEdit'
        ? sortGlyphsByRecentEdit(filterGlyphs, glyphEditTimes)
        : sortGlyphsByCodePoint(filterGlyphs)

    return createSectionNode(
      customOverviewFilterIdToNodeId(filter.id),
      filter.name,
      sortedGlyphs,
      'filter',
      undefined,
      filter.labelKey
    )
  })
}

export const getGlyphOverviewTree = (
  glyphs: GlyphData[],
  glyphEditTimes: GlyphEditTimes,
  customFilters: OverviewCustomFilter[] = createDefaultOverviewCustomFilters()
): GlyphOverviewTreeNode[] => {
  const categoryNodes = buildCategoryNodes(glyphs)
  const languageNodes = buildLanguageNodes(glyphs)
  const filterNodes = buildFilterNodes(
    glyphs,
    glyphEditTimes,
    normalizeOverviewCustomFilters(customFilters)
  )

  return [
    createSectionNode('all', 'All', glyphs, 'all'),
    createSectionNode(
      'filters',
      'Filters',
      uniqueGlyphs(filterNodes.flatMap((node) => node.glyphs)),
      'filter',
      filterNodes
    ),
    createSectionNode(
      'categories',
      'Categories',
      glyphs,
      'category',
      categoryNodes
    ),
    createSectionNode(
      'languages',
      'Languages',
      glyphs,
      'language',
      languageNodes
    ),
  ]
}

export const flattenGlyphOverviewTree = (
  nodes: GlyphOverviewTreeNode[]
): GlyphOverviewSection[] =>
  nodes.flatMap((node) => [
    {
      id: node.id,
      labelKey: node.labelKey,
      label: node.label,
      glyphs: node.glyphs,
      kind: node.kind,
    },
    ...flattenGlyphOverviewTree(node.children ?? []),
  ])

export const getGlyphOverviewSections = (
  glyphs: GlyphData[],
  groupBy: OverviewGroupBy
): GlyphOverviewSection[] => {
  if (groupBy === 'none') {
    return [
      {
        id: 'all',
        label: 'All',
        glyphs: [...glyphs].sort((left, right) =>
          left.id.localeCompare(right.id)
        ),
        kind: 'all',
      },
    ]
  }

  const sectionMap = new Map<string, GlyphData[]>()

  for (const glyph of glyphs) {
    const key =
      groupBy === 'script'
        ? getGlyphScriptLabel(glyph)
        : getGlyphBlockLabel(glyph)
    const items = sectionMap.get(key) ?? []
    items.push(glyph)
    sectionMap.set(key, items)
  }

  return [...sectionMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, sectionGlyphs]) => ({
      id: label,
      label,
      glyphs: [...sectionGlyphs].sort((left, right) =>
        left.id.localeCompare(right.id)
      ),
      kind: groupBy === 'script' ? 'language' : 'category',
    }))
}

export const getGlyphOverviewStats = (glyph: GlyphData) => {
  const layer = activeLayer(glyph)
  return {
    contourCount: layer.paths.length,
    componentCount: layer.componentRefs.length,
    anchorCount: layer.anchors?.length ?? 0,
    guidelineCount: layer.guidelines?.length ?? 0,
  }
}
