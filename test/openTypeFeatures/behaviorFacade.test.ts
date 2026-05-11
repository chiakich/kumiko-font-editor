import { describe, expect, it } from 'vitest'
import {
  createEmptyOpenTypeFeaturesState,
  deriveGlyphAlternateBehaviors,
  deriveGlyphCombinationBehaviors,
  deriveGlyphSpacingBehaviors,
  makeEditableGlyphCopy,
  makeCompositeGlyphFromComponents,
  upsertAlternateBehavior,
  upsertCombinationBehavior,
  upsertSpacingBehavior,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import type { FontData, GlyphData } from 'src/store'

describe('OpenType behavior facade', () => {
  it('derives glyph-local combination rows from ligature rules', () => {
    const fontData = makeFontData(makeFeatureState())

    expect(deriveGlyphCombinationBehaviors(fontData, 'f')).toMatchObject([
      {
        input: 'f+i',
        output: 'f_i',
        type: 'standardLigature',
        featureTag: 'liga',
        sourceLabel: 'Manual · liga',
      },
    ])
    expect(deriveGlyphCombinationBehaviors(fontData, 'i')).toHaveLength(1)
    expect(deriveGlyphCombinationBehaviors(fontData, 'A')).toEqual([])
  })

  it('upserts combination rules through semantic behavior fields', () => {
    const state = upsertCombinationBehavior(
      createEmptyOpenTypeFeaturesState(),
      {
        input: 'f+t',
        output: 'f_t',
        type: 'decorativeLigature',
      }
    )

    expect(state.features).toMatchObject([
      {
        tag: 'dlig',
        entries: [{ lookupIds: ['lookup_dlig_behavior_combinations'] }],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_dlig_behavior_combinations',
        lookupType: 'ligatureSubst',
        rules: [
          {
            kind: 'ligatureSubstitution',
            components: ['f', 't'],
            replacement: 'f_t',
          },
        ],
      },
    ])
  })

  it('derives and upserts alternate rows through semantic behavior fields', () => {
    const state = upsertAlternateBehavior(createEmptyOpenTypeFeaturesState(), {
      source: 'f',
      alternate: 'f.alt',
      type: 'stylisticAlternate',
    })
    const fontData = makeFontData(state)
    fontData.glyphs['f.alt'] = makeGlyph('f.alt', 500)

    expect(state.features).toMatchObject([
      {
        tag: 'salt',
        entries: [{ lookupIds: ['lookup_salt_behavior_alternates'] }],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_salt_behavior_alternates',
        lookupType: 'singleSubst',
        rules: [
          {
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'f' },
            replacement: 'f.alt',
          },
        ],
      },
    ])
    expect(deriveGlyphAlternateBehaviors(fontData, 'f')).toMatchObject([
      {
        source: 'f',
        alternate: 'f.alt',
        type: 'stylisticAlternate',
        featureTag: 'salt',
      },
    ])
  })

  it('creates an editable output glyph from source glyph outlines', () => {
    const fontData = makeFontData(createEmptyOpenTypeFeaturesState())
    const glyph = makeCompositeGlyphFromComponents(fontData, 'f_t', ['f', 't'])

    expect(glyph).toMatchObject({
      id: 'f_t',
      components: [],
      componentRefs: [],
      metrics: { width: 900, lsb: 0, rsb: 900 },
    })
    expect(glyph?.paths.map((path) => path.id)).toEqual([
      'f_0_f_path',
      't_1_t_path',
    ])
    expect(glyph?.paths[0]?.nodes[0]).toMatchObject({
      id: 'f_0_f_node_0',
      x: 0,
    })
    expect(glyph?.paths[1]?.nodes[0]).toMatchObject({
      id: 't_1_t_node_0',
      x: 500,
    })
  })

  it('duplicates a source glyph as an editable alternate glyph', () => {
    const fontData = makeFontData(createEmptyOpenTypeFeaturesState())
    const glyph = makeEditableGlyphCopy(fontData, 'f.alt', 'f')

    expect(glyph).toMatchObject({
      id: 'f.alt',
      name: 'f.alt',
      unicode: null,
      metrics: { width: 500, lsb: 0, rsb: 500 },
    })
    expect(glyph?.paths[0]?.id).toBe('f.alt_f_path')
    expect(glyph?.paths[0]?.nodes[0]?.id).toBe('f.alt_f_node_0')
  })

  it('derives and upserts spacing rows through semantic behavior fields', () => {
    const state = upsertSpacingBehavior(createEmptyOpenTypeFeaturesState(), {
      left: 'A',
      right: 'V',
      value: -80,
    })
    const fontData = makeFontData(state)
    fontData.glyphs.A = makeGlyph('A', 700)
    fontData.glyphs.V = makeGlyph('V', 700)

    expect(state.features).toMatchObject([
      {
        tag: 'kern',
        entries: [{ lookupIds: ['lookup_kern_behavior_spacing'] }],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_kern_behavior_spacing',
        table: 'GPOS',
        lookupType: 'pairPos',
        rules: [
          {
            kind: 'pairPositioning',
            left: { kind: 'glyph', glyph: 'A' },
            right: { kind: 'glyph', glyph: 'V' },
            firstValue: { xAdvance: -80 },
          },
        ],
      },
    ])
    expect(deriveGlyphSpacingBehaviors(fontData, 'A')).toMatchObject([
      {
        left: 'A',
        right: 'V',
        value: -80,
        featureTag: 'kern',
      },
    ])
  })
})

function makeFeatureState(): OpenTypeFeaturesState {
  return {
    ...createEmptyOpenTypeFeaturesState(),
    features: [
      {
        id: 'feature_liga',
        tag: 'liga',
        isActive: true,
        entries: [
          {
            id: 'entry_liga',
            script: 'DFLT',
            language: 'dflt',
            lookupIds: ['lookup_liga_manual'],
          },
        ],
        origin: 'manual',
      },
    ],
    lookups: [
      {
        id: 'lookup_liga_manual',
        name: 'lookup_liga_manual',
        table: 'GSUB',
        lookupType: 'ligatureSubst',
        lookupFlag: {},
        editable: true,
        origin: 'manual',
        rules: [
          {
            id: 'rule_f_i',
            kind: 'ligatureSubstitution',
            components: ['f', 'i'],
            replacement: 'f_i',
            meta: { origin: 'manual' },
          },
        ],
      },
    ],
  }
}

function makeFontData(openTypeFeatures: OpenTypeFeaturesState): FontData {
  return {
    glyphs: {
      f: makeGlyph('f', 500),
      i: makeGlyph('i', 240),
      t: makeGlyph('t', 400),
      f_i: makeGlyph('f_i', 740),
    },
    openTypeFeatures,
  }
}

function makeGlyph(id: string, width: number): GlyphData {
  return {
    id,
    name: id,
    unicode: null,
    paths: [
      {
        id: `${id}_path`,
        closed: true,
        nodes: [
          { id: `${id}_node_0`, x: 0, y: 0, type: 'corner' },
          { id: `${id}_node_1`, x: width, y: 0, type: 'corner' },
        ],
      },
    ],
    components: [],
    componentRefs: [],
    anchors: [],
    guidelines: [],
    metrics: {
      width,
      lsb: 0,
      rsb: width,
    },
  }
}
