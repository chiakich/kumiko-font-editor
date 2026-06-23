import { describe, expect, it } from 'vitest'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'

describe('OpenType raw FEA GPOS classifier', () => {
  it('classifies raw contextual positioning rules', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'lookup KernAV {',
          '  pos A V -80;',
          '} KernAV;',
          'feature kern {',
          '  script latn;',
          '  language dflt;',
          "  pos A' lookup KernAV V;",
          "  ignore pos X X' V;",
          '} kern;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_KernAV',
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
      {
        id: 'lookup_raw_kern_0',
        table: 'GPOS',
        lookupType: 'chainingContextPos',
        rules: [
          {
            kind: 'contextualPositioning',
            mode: 'chaining',
            input: [
              {
                selector: { kind: 'glyph', glyph: 'A' },
                lookupIds: ['lookup_raw_KernAV'],
              },
            ],
            lookahead: [{ kind: 'glyph', glyph: 'V' }],
          },
          {
            kind: 'contextualPositioning',
            mode: 'chaining',
            backtrack: [{ kind: 'glyph', glyph: 'X' }],
            input: [{ selector: { kind: 'glyph', glyph: 'X' } }],
            lookahead: [{ kind: 'glyph', glyph: 'V' }],
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'lookup', id: 'lookup_raw_KernAV', table: 'GPOS' },
        { kind: 'lookup', id: 'lookup_raw_kern_0', table: 'GPOS' },
        { kind: 'feature', id: 'feature_raw_kern' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated.indexOf('lookup KernAV {')).toBeLessThan(
      generated.indexOf('lookup raw_kern_0 {')
    )
    expect(generated).toContain("pos A' lookup KernAV V;")
    expect(generated).toContain("ignore pos X X' V;")
    expect(generated).not.toContain('Unsupported generated rule kind')
  })

  it('promotes inline glyph lists in raw positioning selectors to glyph classes', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'lookup KernClass {',
          '  pos [A Aacute] [V W] -80;',
          '} KernClass;',
          'lookup ShiftRound {',
          '  pos [O Q] -20;',
          '} ShiftRound;',
          'feature kern {',
          '  script latn;',
          '  language dflt;',
          '  lookup KernClass;',
          '} kern;',
          'feature calt {',
          '  script latn;',
          '  language dflt;',
          "  pos [O Q]' lookup ShiftRound [T Y];",
          "  ignore pos [A Aacute] [O Q]' [V W];",
          '} calt;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.glyphClasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'glyph_class_raw_KumikoRawInline_A_Aacute',
          name: '@KumikoRawInline_A_Aacute',
          glyphs: ['A', 'Aacute'],
          origin: 'manual',
        }),
        expect.objectContaining({
          id: 'glyph_class_raw_KumikoRawInline_V_W',
          name: '@KumikoRawInline_V_W',
          glyphs: ['V', 'W'],
          origin: 'manual',
        }),
        expect.objectContaining({
          id: 'glyph_class_raw_KumikoRawInline_O_Q',
          name: '@KumikoRawInline_O_Q',
          glyphs: ['O', 'Q'],
          origin: 'manual',
        }),
        expect.objectContaining({
          id: 'glyph_class_raw_KumikoRawInline_T_Y',
          name: '@KumikoRawInline_T_Y',
          glyphs: ['T', 'Y'],
          origin: 'manual',
        }),
      ])
    )
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_KernClass',
        table: 'GPOS',
        lookupType: 'pairPos',
        rules: [
          {
            kind: 'pairPositioning',
            left: {
              kind: 'class',
              classId: 'glyph_class_raw_KumikoRawInline_A_Aacute',
            },
            right: {
              kind: 'class',
              classId: 'glyph_class_raw_KumikoRawInline_V_W',
            },
            firstValue: { xAdvance: -80 },
          },
        ],
      },
      {
        id: 'lookup_raw_ShiftRound',
        table: 'GPOS',
        lookupType: 'singlePos',
        rules: [
          {
            kind: 'singlePositioning',
            target: {
              kind: 'class',
              classId: 'glyph_class_raw_KumikoRawInline_O_Q',
            },
            value: { xAdvance: -20 },
          },
        ],
      },
      {
        id: 'lookup_raw_calt_1',
        table: 'GPOS',
        lookupType: 'chainingContextPos',
        rules: [
          {
            kind: 'contextualPositioning',
            input: [
              {
                selector: {
                  kind: 'class',
                  classId: 'glyph_class_raw_KumikoRawInline_O_Q',
                },
                lookupIds: ['lookup_raw_ShiftRound'],
              },
            ],
            lookahead: [
              {
                kind: 'class',
                classId: 'glyph_class_raw_KumikoRawInline_T_Y',
              },
            ],
          },
          {
            kind: 'contextualPositioning',
            backtrack: [
              {
                kind: 'class',
                classId: 'glyph_class_raw_KumikoRawInline_A_Aacute',
              },
            ],
            input: [
              {
                selector: {
                  kind: 'class',
                  classId: 'glyph_class_raw_KumikoRawInline_O_Q',
                },
              },
            ],
            lookahead: [
              {
                kind: 'class',
                classId: 'glyph_class_raw_KumikoRawInline_V_W',
              },
            ],
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        {
          kind: 'glyphClass',
          id: 'glyph_class_raw_KumikoRawInline_A_Aacute',
        },
        { kind: 'glyphClass', id: 'glyph_class_raw_KumikoRawInline_V_W' },
        { kind: 'glyphClass', id: 'glyph_class_raw_KumikoRawInline_O_Q' },
        { kind: 'glyphClass', id: 'glyph_class_raw_KumikoRawInline_T_Y' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('@KumikoRawInline_A_Aacute = [A Aacute];')
    expect(generated).toContain(
      'pos @KumikoRawInline_A_Aacute @KumikoRawInline_V_W -80;'
    )
    expect(generated).toContain('pos @KumikoRawInline_O_Q -20;')
    expect(generated).toContain(
      "pos @KumikoRawInline_O_Q' lookup ShiftRound @KumikoRawInline_T_Y;"
    )
    expect(generated).toContain(
      "ignore pos @KumikoRawInline_A_Aacute @KumikoRawInline_O_Q' @KumikoRawInline_V_W;"
    )
  })

  it('classifies raw pair positioning with second value records', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'feature kern {',
          '  script latn;',
          '  language dflt;',
          '  pos A V <0 0 -80 0> <0 0 -20 0>;',
          '} kern;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_kern_0',
        table: 'GPOS',
        lookupType: 'pairPos',
        rules: [
          {
            kind: 'pairPositioning',
            left: { kind: 'glyph', glyph: 'A' },
            right: { kind: 'glyph', glyph: 'V' },
            firstValue: {
              xPlacement: 0,
              yPlacement: 0,
              xAdvance: -80,
              yAdvance: 0,
            },
            secondValue: {
              xPlacement: 0,
              yPlacement: 0,
              xAdvance: -20,
              yAdvance: 0,
            },
          },
        ],
      },
    ])

    expect(generateFea(state).text).toContain('pos A V -80 -20;')
  })

  it('accepts raw subtable break hints without preserving them as rules', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature kern {',
          '  pos A V -80;',
          '  subtable;',
          '  pos T o -40;',
          '} kern;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_kern_0',
        table: 'GPOS',
        lookupType: 'pairPos',
        rules: [
          {
            kind: 'pairPositioning',
            left: { kind: 'glyph', glyph: 'A' },
            right: { kind: 'glyph', glyph: 'V' },
            firstValue: { xAdvance: -80 },
          },
          {
            kind: 'pairPositioning',
            left: { kind: 'glyph', glyph: 'T' },
            right: { kind: 'glyph', glyph: 'o' },
            firstValue: { xAdvance: -40 },
          },
        ],
      },
    ])

    const generated = generateFea(state).text
    expect(generated).toContain('pos A V -80;')
    expect(generated).toContain('pos T o -40;')
    expect(generated).not.toContain('subtable;')
  })

  it('classifies raw mark classes and mark positioning lookup blocks', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          '@CombiningMarks = [acutecomb gravecomb];',
          'markClass @CombiningMarks <anchor 0 520> @TOP;',
          'markClass [dotaccent] <anchor 20 530> @TOP;',
          'lookup MarkBase {',
          '  pos base A <anchor 300 700> mark @TOP;',
          '} MarkBase;',
          'lookup MarkLigature {',
          '  pos ligature f_i <anchor 200 700> mark @TOP ligComponent <anchor 420 700> mark @TOP;',
          '} MarkLigature;',
          'lookup MarkMark {',
          '  pos mark acutecomb <anchor 0 720> mark @TOP;',
          '} MarkMark;',
          'feature mark {',
          '  script latn;',
          '  language dflt;',
          '  lookup MarkBase;',
          '  lookup MarkLigature;',
          '} mark;',
          'feature mkmk {',
          '  script latn;',
          '  language dflt;',
          '  lookup MarkMark;',
          '} mkmk;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.markClasses).toEqual([
      {
        id: 'mark_class_raw_TOP',
        name: '@TOP',
        marks: [
          { glyph: 'acutecomb', anchor: { x: 0, y: 520 } },
          { glyph: 'gravecomb', anchor: { x: 0, y: 520 } },
          { glyph: 'dotaccent', anchor: { x: 20, y: 530 } },
        ],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_MarkBase',
        table: 'GPOS',
        lookupType: 'markToBasePos',
        rules: [
          {
            kind: 'markToBase',
            baseGlyphs: { kind: 'glyph', glyph: 'A' },
            anchors: {
              mark_class_raw_TOP: { x: 300, y: 700 },
            },
          },
        ],
      },
      {
        id: 'lookup_raw_MarkLigature',
        table: 'GPOS',
        lookupType: 'markToLigaturePos',
        rules: [
          {
            kind: 'markToLigature',
            ligatures: { kind: 'glyph', glyph: 'f_i' },
            componentAnchors: [
              { mark_class_raw_TOP: { x: 200, y: 700 } },
              { mark_class_raw_TOP: { x: 420, y: 700 } },
            ],
          },
        ],
      },
      {
        id: 'lookup_raw_MarkMark',
        table: 'GPOS',
        lookupType: 'markToMarkPos',
        rules: [
          {
            kind: 'markToMark',
            baseMarks: { kind: 'glyph', glyph: 'acutecomb' },
            anchors: {
              mark_class_raw_TOP: { x: 0, y: 720 },
            },
          },
        ],
      },
    ])
    expect(state.features).toMatchObject([
      {
        tag: 'mark',
        entries: [
          {
            lookupIds: ['lookup_raw_MarkBase', 'lookup_raw_MarkLigature'],
          },
        ],
      },
      {
        tag: 'mkmk',
        entries: [
          {
            lookupIds: ['lookup_raw_MarkMark'],
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'glyphClass', id: 'glyph_class_raw_CombiningMarks' },
        { kind: 'markClass', id: 'mark_class_raw_TOP' },
        { kind: 'lookup', id: 'lookup_raw_MarkBase', table: 'GPOS' },
        { kind: 'lookup', id: 'lookup_raw_MarkLigature', table: 'GPOS' },
        { kind: 'lookup', id: 'lookup_raw_MarkMark', table: 'GPOS' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('markClass acutecomb <anchor 0 520> @TOP;')
    expect(generated).toContain('markClass gravecomb <anchor 0 520> @TOP;')
    expect(generated).toContain('markClass dotaccent <anchor 20 530> @TOP;')
    expect(generated).toContain('pos base A <anchor 300 700> mark @TOP;')
    expect(generated).toContain(
      'pos ligature f_i <anchor 200 700> mark @TOP ligComponent <anchor 420 700> mark @TOP;'
    )
    expect(generated).toContain('pos mark acutecomb <anchor 0 720> mark @TOP;')
  })

  it('classifies and serializes raw cursive positioning lookup blocks', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem arab dflt;',
          'lookup JoinCursive {',
          '  pos cursive beh.init <anchor NULL> <anchor 480 0>;',
          '  pos cursive beh.medi <anchor 20 0> <anchor 480 0>;',
          '} JoinCursive;',
          'feature curs {',
          '  script arab;',
          '  language dflt;',
          '  lookup JoinCursive;',
          '} curs;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_JoinCursive',
        table: 'GPOS',
        lookupType: 'cursivePos',
        rules: [
          {
            kind: 'cursivePositioning',
            glyphs: { kind: 'glyph', glyph: 'beh.init' },
            entryAnchor: undefined,
            exitAnchor: { x: 480, y: 0 },
          },
          {
            kind: 'cursivePositioning',
            glyphs: { kind: 'glyph', glyph: 'beh.medi' },
            entryAnchor: { x: 20, y: 0 },
            exitAnchor: { x: 480, y: 0 },
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'lookup', id: 'lookup_raw_JoinCursive', table: 'GPOS' },
        { kind: 'feature', id: 'feature_raw_curs' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain(
      'pos cursive beh.init <anchor NULL> <anchor 480 0>;'
    )
    expect(generated).toContain(
      'pos cursive beh.medi <anchor 20 0> <anchor 480 0>;'
    )
    expect(generated).not.toContain('Unsupported generated rule kind')
  })
})
