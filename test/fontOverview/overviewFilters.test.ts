import { describe, expect, it } from 'vitest'
import {
  customOverviewFilterIdToNodeId,
  filterGlyphsByOverviewSearch,
  getGlyphOverviewTree,
  type GlyphOverviewTreeNode,
} from 'src/lib/glyph/glyphOverview'
import type { GlyphData, GlyphHint } from 'src/store'
import { normalizeGlyphToLayers } from 'src/store'

const makeGlyph = (input: {
  anchors?: string[]
  category?: string | null
  color?: GlyphData['color']
  componentRefs?: string[]
  drawn?: boolean
  export?: boolean
  hints?: GlyphHint[]
  id: string
  leftMetricsKey?: string | null
  note?: string | null
  production?: string | null
  subCategory?: string | null
  unicode?: string | null
}) => {
  const glyph = normalizeGlyphToLayers({
    id: input.id,
    name: input.id,
    category: input.category,
    color: input.color,
    componentRefs: (input.componentRefs ?? []).map((glyphId) => ({
      glyphId,
      id: `component-${glyphId}`,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
    })),
    components: [],
    export: input.export,
    leftMetricsKey: input.leftMetricsKey,
    metrics: { lsb: 0, rsb: 0, width: 1000 },
    note: input.note,
    paths: input.drawn ? [{ id: 'p1', nodes: [], closed: true }] : [],
    production: input.production,
    subCategory: input.subCategory,
    unicodes: input.unicode ? [input.unicode] : [],
    anchors: (input.anchors ?? []).map((name) => ({
      id: `anchor-${name}`,
      name,
      x: 0,
      y: 0,
    })),
    guidelines: [],
  }) as unknown as GlyphData

  const activeLayerId = glyph.activeLayerId ?? glyph.layerOrder?.[0]
  if (activeLayerId && glyph.layers?.[activeLayerId] && input.hints) {
    glyph.layers[activeLayerId].hints = input.hints
  }

  return glyph
}

const findNode = (
  nodes: GlyphOverviewTreeNode[],
  id: string
): GlyphOverviewTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }
    const child = findNode(node.children ?? [], id)
    if (child) {
      return child
    }
  }

  return null
}

const ids = (glyphs: GlyphData[]) => glyphs.map((glyph) => glyph.id)
const seededFilterNodeId = (id: string) =>
  customOverviewFilterIdToNodeId(`seeded:${id}`)

describe('overview search filters', () => {
  const glyphs = [
    makeGlyph({
      componentRefs: ['acute'],
      id: 'Aring',
      note: 'Nordic uppercase letter',
      unicode: '00C5',
    }),
    makeGlyph({ id: 'aring', unicode: '00E5' }),
    makeGlyph({ id: 'thorn', note: 'Icelandic thorn', unicode: '00FE' }),
    makeGlyph({ id: 'A.sc', unicode: null }),
    makeGlyph({ id: '林', unicode: '6797' }),
  ]

  it('matches Glyphs-style name, Unicode value, character, and note fields', () => {
    expect(
      ids(filterGlyphsByOverviewSearch(glyphs, { query: 'thorn' }))
    ).toEqual(['thorn'])
    expect(
      ids(filterGlyphsByOverviewSearch(glyphs, { query: '00FE' }))
    ).toEqual(['thorn'])
    expect(ids(filterGlyphsByOverviewSearch(glyphs, { query: 'þ' }))).toEqual([
      'thorn',
    ])
    expect(
      ids(filterGlyphsByOverviewSearch(glyphs, { query: 'Icelandic' }))
    ).toEqual(['thorn'])
  })

  it('preserves Kumiko component and IDS search extensions', () => {
    expect(
      ids(filterGlyphsByOverviewSearch(glyphs, { query: 'acute' }))
    ).toEqual(['Aring'])
    expect(
      ids(
        filterGlyphsByOverviewSearch(
          glyphs,
          { query: '木' },
          { 林: ['木', '木'] }
        )
      )
    ).toEqual(['林'])
  })

  it('supports regex and case-sensitive search options', () => {
    expect(
      ids(
        filterGlyphsByOverviewSearch(glyphs, { query: '.*\\.sc$', regex: true })
      )
    ).toEqual(['A.sc'])
    expect(
      ids(
        filterGlyphsByOverviewSearch(glyphs, {
          matchCase: true,
          query: 'Aring',
        })
      )
    ).toEqual(['Aring'])
    expect(
      ids(
        filterGlyphsByOverviewSearch(glyphs, {
          matchCase: true,
          query: 'aring',
        })
      )
    ).toEqual(['aring'])
  })
})

describe('Glyphs-like overview tree', () => {
  const glyphs = [
    makeGlyph({
      category: 'Letter',
      drawn: true,
      id: 'A',
      subCategory: 'Uppercase',
      unicode: '0041',
    }),
    makeGlyph({
      anchors: ['top'],
      category: 'Letter',
      drawn: true,
      hints: [{ type: 'stem' }],
      id: 'acute',
      leftMetricsKey: 'A',
      subCategory: 'Mark',
      unicode: '0301',
    }),
    makeGlyph({
      componentRefs: ['A', 'acute'],
      drawn: true,
      id: 'Aacute',
      unicode: '00C1',
    }),
    makeGlyph({
      drawn: false,
      export: false,
      id: 'uni4E00',
      unicode: '4E00',
    }),
    makeGlyph({
      color: [0.9, 0.2, 0.2, 1],
      id: 'logo.alt',
      production: 'logoAlt',
    }),
  ]

  const tree = getGlyphOverviewTree(glyphs, {
    A: 10,
    acute: 30,
    Aacute: 20,
  })

  it('groups the sidebar into Glyphs-style top-level sections', () => {
    expect(tree.map((node) => node.id)).toEqual([
      'all',
      'filters',
      'categories',
      'languages',
    ])
  })

  it('uses explicit Glyphs categories and subcategories when available', () => {
    expect(ids(findNode(tree, 'category:Letter')?.glyphs ?? [])).toEqual([
      'A',
      'Aacute',
      'acute',
      'uni4E00',
    ])
    expect(
      ids(findNode(tree, 'category:Letter/Uppercase')?.glyphs ?? [])
    ).toEqual(['A'])
    expect(ids(findNode(tree, 'category:Letter/Mark')?.glyphs ?? [])).toEqual([
      'acute',
    ])
  })

  it('keeps language script filters under a Languages section', () => {
    expect(ids(findNode(tree, 'script:Latin')?.glyphs ?? [])).toEqual([
      'A',
      'Aacute',
    ])
    expect(ids(findNode(tree, 'script:Other')?.glyphs ?? [])).toEqual(['acute'])
    expect(
      ids(findNode(tree, 'script:CJK Unified Ideographs')?.glyphs ?? [])
    ).toEqual(['uni4E00'])
  })

  it('creates seeded smart filter style sections', () => {
    expect(
      ids(findNode(tree, seededFilterNodeId('recent-edits'))?.glyphs ?? [])
    ).toEqual(['acute', 'Aacute', 'A'])
    expect(
      ids(findNode(tree, seededFilterNodeId('empty'))?.glyphs ?? [])
    ).toEqual(['uni4E00', 'logo.alt'])
    expect(
      ids(findNode(tree, seededFilterNodeId('has-color-label'))?.glyphs ?? [])
    ).toEqual(['logo.alt'])
    expect(findNode(tree, seededFilterNodeId('not-exporting'))).toBeNull()
  })

  it('adds custom filter sections under smart filters', () => {
    const customFilterId = 'components-with-accent'
    const customTree = getGlyphOverviewTree(glyphs, {}, [
      {
        id: customFilterId,
        mode: 'all',
        name: 'Components with accent',
        rules: [
          {
            field: 'component',
            id: 'component-rule',
            operator: 'contains',
            value: 'acute',
          },
          {
            field: 'export',
            id: 'export-rule',
            operator: 'is',
            value: 'true',
          },
        ],
      },
    ])

    const filtersNode = findNode(customTree, 'filters')
    const customNode = findNode(
      customTree,
      customOverviewFilterIdToNodeId(customFilterId)
    )

    expect(filtersNode?.children?.at(-1)?.id).toBe(
      customOverviewFilterIdToNodeId(customFilterId)
    )
    expect(customNode?.label).toBe('Components with accent')
    expect(ids(customNode?.glyphs ?? [])).toEqual(['Aacute'])
  })
})
