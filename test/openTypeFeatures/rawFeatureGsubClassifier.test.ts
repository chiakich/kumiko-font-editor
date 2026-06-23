import { describe, expect, it } from 'vitest'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'

describe('OpenType raw FEA GSUB classifier', () => {
  it('classifies raw lookup blocks and contextual substitution rules', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'lookup SwapA {',
          '  sub A by A.alt;',
          '} SwapA;',
          'feature calt {',
          '  script latn;',
          '  language dflt;',
          "  sub A' lookup SwapA B;",
          "  ignore sub C C' D;",
          '} calt;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
      meta: {
        classifiedIntoModel: true,
        preserveRawTextInGeneratedFea: false,
      },
    })
    expect(state.features).toMatchObject([
      {
        id: 'feature_raw_calt',
        tag: 'calt',
        entries: [
          {
            script: 'latn',
            language: 'dflt',
            lookupIds: ['lookup_raw_calt_0'],
          },
        ],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_SwapA',
        name: 'SwapA',
        table: 'GSUB',
        lookupType: 'singleSubst',
        rules: [
          {
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'A' },
            replacement: 'A.alt',
          },
        ],
      },
      {
        id: 'lookup_raw_calt_0',
        table: 'GSUB',
        lookupType: 'chainingContextSubst',
        rules: [
          {
            kind: 'contextualSubstitution',
            mode: 'chaining',
            backtrack: [],
            input: [
              {
                selector: { kind: 'glyph', glyph: 'A' },
                lookupIds: ['lookup_raw_SwapA'],
              },
            ],
            lookahead: [{ kind: 'glyph', glyph: 'B' }],
          },
          {
            kind: 'contextualSubstitution',
            mode: 'chaining',
            backtrack: [{ kind: 'glyph', glyph: 'C' }],
            input: [{ selector: { kind: 'glyph', glyph: 'C' } }],
            lookahead: [{ kind: 'glyph', glyph: 'D' }],
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'lookup', id: 'lookup_raw_SwapA', table: 'GSUB' },
        { kind: 'lookup', id: 'lookup_raw_calt_0', table: 'GSUB' },
        { kind: 'feature', id: 'feature_raw_calt' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated.indexOf('lookup SwapA {')).toBeLessThan(
      generated.indexOf('lookup raw_calt_0 {')
    )
    expect(generated).toContain("sub A' lookup SwapA B;")
    expect(generated).toContain("ignore sub C C' D;")
  })

  it('classifies raw multiple and alternate substitution lookup blocks', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'lookup ExpandA {',
          '  sub A by A A.alt;',
          '} ExpandA;',
          'lookup AlternateB {',
          '  sub B from [B.alt B.swash];',
          '} AlternateB;',
          'feature salt {',
          '  script latn;',
          '  language dflt;',
          '  lookup ExpandA;',
          '  lookup AlternateB;',
          '} salt;',
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
        id: 'lookup_raw_ExpandA',
        table: 'GSUB',
        lookupType: 'multipleSubst',
        rules: [
          {
            kind: 'multipleSubstitution',
            target: 'A',
            replacement: ['A', 'A.alt'],
          },
        ],
      },
      {
        id: 'lookup_raw_AlternateB',
        table: 'GSUB',
        lookupType: 'alternateSubst',
        rules: [
          {
            kind: 'alternateSubstitution',
            target: 'B',
            alternates: ['B.alt', 'B.swash'],
          },
        ],
      },
    ])
    expect(state.features).toMatchObject([
      {
        id: 'feature_raw_salt',
        tag: 'salt',
        entries: [
          {
            lookupIds: ['lookup_raw_ExpandA', 'lookup_raw_AlternateB'],
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'lookup', id: 'lookup_raw_ExpandA', table: 'GSUB' },
        { kind: 'lookup', id: 'lookup_raw_AlternateB', table: 'GSUB' },
        { kind: 'feature', id: 'feature_raw_salt' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('sub A by A A.alt;')
    expect(generated).toContain('sub B from [B.alt B.swash];')
  })

  it('expands raw class-to-class substitution into single substitution rules', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Lower = [a b];',
          '@SmallCaps = [a.sc b.sc];',
          'feature smcp {',
          '  sub @Lower by @SmallCaps;',
          '  sub [c d] by [c.sc d.sc];',
          '} smcp;',
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
        id: 'lookup_raw_smcp_0',
        table: 'GSUB',
        lookupType: 'singleSubst',
        rules: [
          {
            id: 'lookup_raw_smcp_0_rule_0_0',
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'a' },
            replacement: 'a.sc',
          },
          {
            id: 'lookup_raw_smcp_0_rule_0_1',
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'b' },
            replacement: 'b.sc',
          },
          {
            id: 'lookup_raw_smcp_0_rule_1_0',
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'c' },
            replacement: 'c.sc',
          },
          {
            id: 'lookup_raw_smcp_0_rule_1_1',
            kind: 'singleSubstitution',
            target: { kind: 'glyph', glyph: 'd' },
            replacement: 'd.sc',
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'glyphClass', id: 'glyph_class_raw_Lower' },
        { kind: 'glyphClass', id: 'glyph_class_raw_SmallCaps' },
        { kind: 'lookup', id: 'lookup_raw_smcp_0', table: 'GSUB' },
        { kind: 'feature', id: 'feature_raw_smcp' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('sub a by a.sc;')
    expect(generated).toContain('sub b by b.sc;')
    expect(generated).toContain('sub c by c.sc;')
    expect(generated).toContain('sub d by d.sc;')
    expect(generated).not.toContain('sub @Lower by @SmallCaps;')
  })

  it('preserves raw source when class-to-class substitution lengths differ', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Lower = [a b];',
          '@SmallCaps = [a.sc];',
          'feature smcp {',
          '  sub @Lower by @SmallCaps;',
          '} smcp;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'source',
      status: 'raw',
      recordRefs: [],
      meta: {
        classifiedIntoModel: false,
        preserveRawTextInGeneratedFea: true,
      },
    })
    expect(state.lookups).toEqual([])
    expect(generateFea(state).text).toContain('sub @Lower by @SmallCaps;')
  })

  it('classifies comma-separated raw contextual ignore rules as separate rules', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature calt {',
          "  ignore sub f' i, f' l;",
          '} calt;',
          'feature kern {',
          "  ignore pos A A' V, A A' W;",
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
        id: 'lookup_raw_calt_0',
        table: 'GSUB',
        lookupType: 'chainingContextSubst',
        rules: [
          {
            kind: 'contextualSubstitution',
            id: 'lookup_raw_calt_0_rule_0_0',
            input: [{ selector: { kind: 'glyph', glyph: 'f' } }],
            lookahead: [{ kind: 'glyph', glyph: 'i' }],
          },
          {
            kind: 'contextualSubstitution',
            id: 'lookup_raw_calt_0_rule_0_1',
            input: [{ selector: { kind: 'glyph', glyph: 'f' } }],
            lookahead: [{ kind: 'glyph', glyph: 'l' }],
          },
        ],
      },
      {
        id: 'lookup_raw_kern_1',
        table: 'GPOS',
        lookupType: 'chainingContextPos',
        rules: [
          {
            kind: 'contextualPositioning',
            id: 'lookup_raw_kern_1_rule_0_0',
            backtrack: [{ kind: 'glyph', glyph: 'A' }],
            input: [{ selector: { kind: 'glyph', glyph: 'A' } }],
            lookahead: [{ kind: 'glyph', glyph: 'V' }],
          },
          {
            kind: 'contextualPositioning',
            id: 'lookup_raw_kern_1_rule_0_1',
            backtrack: [{ kind: 'glyph', glyph: 'A' }],
            input: [{ selector: { kind: 'glyph', glyph: 'A' } }],
            lookahead: [{ kind: 'glyph', glyph: 'W' }],
          },
        ],
      },
    ])

    const generated = generateFea(state).text
    expect(generated).toContain("ignore sub f' i;")
    expect(generated).toContain("ignore sub f' l;")
    expect(generated).toContain("ignore pos A A' V;")
    expect(generated).toContain("ignore pos A A' W;")
    expect(generated).not.toContain('i,')
    expect(generated).not.toContain('V,')
  })

  it('classifies raw reverse chaining single substitution rules', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Before = [x y];',
          'feature rvrn {',
          '  script latn;',
          '  language dflt;',
          "  rsub @Before a' [z z.alt] by a.rev;",
          '} rvrn;',
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
        id: 'lookup_raw_rvrn_0',
        table: 'GSUB',
        lookupType: 'reverseChainingSingleSubst',
        rules: [
          {
            kind: 'reverseChainingSingleSubstitution',
            backtrack: [
              {
                kind: 'class',
                classId: 'glyph_class_raw_Before',
              },
            ],
            target: { kind: 'glyph', glyph: 'a' },
            lookahead: [
              {
                kind: 'class',
                classId: 'glyph_class_raw_KumikoRawInline_z_z_alt',
              },
            ],
            replacement: 'a.rev',
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'glyphClass', id: 'glyph_class_raw_Before' },
        { kind: 'glyphClass', id: 'glyph_class_raw_KumikoRawInline_z_z_alt' },
        { kind: 'lookup', id: 'lookup_raw_rvrn_0', table: 'GSUB' },
        { kind: 'feature', id: 'feature_raw_rvrn' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('@Before = [x y];')
    expect(generated).toContain('@KumikoRawInline_z_z_alt = [z z.alt];')
    expect(generated).toContain(
      "rsub @Before a' @KumikoRawInline_z_z_alt by a.rev;"
    )
  })
})
