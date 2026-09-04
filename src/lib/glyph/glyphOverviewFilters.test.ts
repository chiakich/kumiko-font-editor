import { describe, expect, it } from 'vitest'
import {
  matchesOverviewCustomFilter,
  normalizeOverviewCustomFilters,
  type OverviewCustomFilter,
} from '@/lib/glyph/glyphOverviewFilters'
import { GLYPHS_LABEL_COLORS } from '@/lib/color/kumikoColor'
import type { GlyphData, GlyphLayerData } from '@/domain'

const makeLayer = (
  paths: GlyphLayerData['paths'] = [],
  componentRefs: GlyphLayerData['componentRefs'] = [],
  patch: Partial<GlyphLayerData> = {}
): GlyphLayerData => ({
  id: 'public.default',
  name: 'public.default',
  type: 'master',
  associatedMasterId: 'public.default',
  paths,
  componentRefs,
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  ...patch,
})

const makeGlyph = (
  id: string,
  layer: GlyphLayerData,
  patch: Partial<GlyphData> = {}
): GlyphData => ({
  id,
  name: id,
  activeLayerId: 'public.default',
  category: 'Letter',
  layerOrder: ['public.default'],
  layers: { 'public.default': layer },
  unicodes: ['0041'],
  ...patch,
})

describe('overview custom filters', () => {
  it('normalizes legacy flat rules and nested rule groups', () => {
    const [filter] = normalizeOverviewCustomFilters([
      {
        id: 'smart-filter',
        mode: 'all',
        name: 'Smart Filter',
        rules: [
          {
            field: 'glyphName',
            id: 'r1',
            operator: 'contains',
            value: 'A',
          },
          {
            id: 'g1',
            mode: 'none',
            rules: [
              {
                field: 'component',
                id: 'r2',
                operator: 'contains',
                value: 'acute',
              },
            ],
            type: 'group',
          },
        ],
      },
    ])

    expect(filter?.rules).toHaveLength(2)
    expect(filter?.rules[1]).toMatchObject({
      id: 'g1',
      mode: 'none',
      type: 'group',
    })
  })

  it('matches nested none groups', () => {
    const filter: OverviewCustomFilter = {
      id: 'letters-without-acute',
      mode: 'all',
      name: 'Letters without acute',
      rules: [
        {
          field: 'category',
          id: 'category-rule',
          operator: 'is',
          value: 'Letter',
        },
        {
          id: 'without-acute',
          mode: 'none',
          rules: [
            {
              field: 'component',
              id: 'acute-rule',
              operator: 'contains',
              value: 'acute',
            },
          ],
          type: 'group',
        },
      ],
    }
    const plainGlyph = makeGlyph('A', makeLayer())
    const acuteGlyph = makeGlyph(
      'Aacute',
      makeLayer(
        [],
        [
          {
            glyphId: 'acute',
            id: 'component-1',
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
            x: 0,
            y: 0,
          },
        ]
      )
    )

    expect(matchesOverviewCustomFilter(plainGlyph, filter)).toBe(true)
    expect(matchesOverviewCustomFilter(acuteGlyph, filter)).toBe(false)
  })

  it('matches numeric path count rules', () => {
    const filter: OverviewCustomFilter = {
      id: 'multi-contour',
      mode: 'all',
      name: 'Multi contour',
      rules: [
        {
          field: 'pathCount',
          id: 'paths-rule',
          operator: 'greaterThan',
          value: '1',
        },
      ],
    }
    const path = {
      closed: true,
      id: 'path',
      nodes: [],
    }

    expect(
      matchesOverviewCustomFilter(makeGlyph('one', makeLayer([path])), filter)
    ).toBe(false)
    expect(
      matchesOverviewCustomFilter(
        makeGlyph('two', makeLayer([path, { ...path, id: 'path-2' }])),
        filter
      )
    ).toBe(true)
  })

  it('matches color label values by Glyphs label key', () => {
    const redFilter: OverviewCustomFilter = {
      id: 'red-labels',
      mode: 'all',
      name: 'Red Labels',
      rules: [
        {
          field: 'colorLabel',
          id: 'red-rule',
          operator: 'is',
          value: 'red',
        },
      ],
    }
    const noColorFilter: OverviewCustomFilter = {
      id: 'no-labels',
      mode: 'all',
      name: 'No Labels',
      rules: [
        {
          field: 'colorLabel',
          id: 'none-rule',
          operator: 'is',
          value: 'none',
        },
      ],
    }
    const redGlyph = makeGlyph('red', makeLayer(), {
      color: GLYPHS_LABEL_COLORS[0],
    })
    const noColorGlyph = makeGlyph('plain', makeLayer(), { color: null })

    expect(matchesOverviewCustomFilter(redGlyph, redFilter)).toBe(true)
    expect(matchesOverviewCustomFilter(noColorGlyph, redFilter)).toBe(false)
    expect(matchesOverviewCustomFilter(noColorGlyph, noColorFilter)).toBe(true)
  })

  it('matches layer color labels separately from glyph color labels', () => {
    const layerColorFilter: OverviewCustomFilter = {
      id: 'layer-red-labels',
      mode: 'all',
      name: 'Layer Red Labels',
      rules: [
        {
          field: 'layerColorLabel',
          id: 'layer-red-rule',
          operator: 'is',
          value: 'red',
        },
      ],
    }
    const hasLayerColorFilter: OverviewCustomFilter = {
      id: 'has-layer-labels',
      mode: 'all',
      name: 'Has Layer Labels',
      rules: [
        {
          field: 'hasLayerColorLabel',
          id: 'has-layer-label-rule',
          operator: 'is',
          value: 'true',
        },
      ],
    }
    const redLayerGlyph = makeGlyph(
      'red-layer',
      makeLayer([], [], { color: GLYPHS_LABEL_COLORS[0] })
    )
    const glyphOnlyColorGlyph = makeGlyph('glyph-only', makeLayer(), {
      color: GLYPHS_LABEL_COLORS[0],
    })

    expect(matchesOverviewCustomFilter(redLayerGlyph, layerColorFilter)).toBe(
      true
    )
    expect(
      matchesOverviewCustomFilter(redLayerGlyph, hasLayerColorFilter)
    ).toBe(true)
    expect(
      matchesOverviewCustomFilter(glyphOnlyColorGlyph, layerColorFilter)
    ).toBe(false)
    expect(
      matchesOverviewCustomFilter(glyphOnlyColorGlyph, hasLayerColorFilter)
    ).toBe(false)
  })
})
