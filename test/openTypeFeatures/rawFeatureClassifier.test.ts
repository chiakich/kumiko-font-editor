import { describe, expect, it } from 'vitest'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'

describe('OpenType raw FEA classifier', () => {
  it('tracks raw .fea text as a formal feature source section', () => {
    const state = setRawFeatureTextSource(
      createEmptyOpenTypeFeaturesState(),
      '@Code = [hyphen greater];'
    )

    expect(state.rawFeatureText).toBe('@Code = [hyphen greater];')
    expect(state.sourceSections).toMatchObject([
      {
        id: 'source_raw_feature_text',
        kind: 'manual-fea',
        origin: 'manual-input',
        format: 'fea',
        stage: 'source',
        status: 'raw',
        textRef: 'rawFeatureText',
        preservationPolicy: 'editable-rebuild',
      },
    ])
  })

  it('classifies supported raw .fea source into Kumiko feature records', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '# RAW SOURCE MARKER',
          'languagesystem latn dflt;',
          '@Letters = [f i];',
          'feature liga {',
          '  script latn;',
          '  language dflt;',
          '  sub f i by f_i;',
          '} liga;',
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
    expect(state.languagesystems).toEqual(
      expect.arrayContaining([
        { id: 'languagesystem_latn_dflt', script: 'latn', language: 'dflt' },
      ])
    )
    expect(state.glyphClasses).toMatchObject([
      {
        id: 'glyph_class_raw_Letters',
        name: '@Letters',
        glyphs: ['f', 'i'],
        origin: 'manual',
      },
    ])
    expect(state.features).toMatchObject([
      {
        id: 'feature_raw_liga',
        tag: 'liga',
        entries: [
          {
            script: 'latn',
            language: 'dflt',
            lookupIds: ['lookup_raw_liga_0'],
          },
        ],
      },
    ])
    expect(state.lookups).toMatchObject([
      {
        id: 'lookup_raw_liga_0',
        table: 'GSUB',
        lookupType: 'ligatureSubst',
        rules: [
          {
            kind: 'ligatureSubstitution',
            components: ['f', 'i'],
            replacement: 'f_i',
          },
        ],
      },
    ])
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'languageSystem', id: 'languagesystem_latn_dflt' },
        { kind: 'glyphClass', id: 'glyph_class_raw_Letters' },
        { kind: 'lookup', id: 'lookup_raw_liga_0', table: 'GSUB' },
        { kind: 'feature', id: 'feature_raw_liga' },
      ])
    )

    const generated = generateFea(state)
    expect(generated.text).not.toContain('RAW SOURCE MARKER')
    expect(generated.text).toContain('sub f i by f_i;')
  })

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

  it('classifies raw GDEF table glyph classes and ligature carets', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Bases = [A B];',
          '@Ligatures = [f_i];',
          '@Marks = [acutecomb];',
          '@TopMarks = [acutecomb gravecomb];',
          'table GDEF {',
          '  GlyphClassDef @Bases, @Ligatures, @Marks, ;',
          '  MarkGlyphSetsDef @TopMarks;',
          '  MarkGlyphSetsDef [dotaccent];',
          '  LigatureCaretByPos f_i 250 500;',
          '  LigatureCaretByIndex f_i 3;',
          '} GDEF;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.gdef).toMatchObject({
      glyphClasses: {
        base: ['A', 'B'],
        ligature: ['f_i'],
        mark: ['acutecomb'],
      },
      markGlyphSets: [
        {
          id: 'glyph_class_raw_TopMarks',
          name: '@TopMarks',
          glyphs: ['acutecomb', 'gravecomb'],
        },
        {
          id: 'gdef_mark_glyph_set_raw_1',
          name: '@GDEFMarkGlyphSet1',
          glyphs: ['dotaccent'],
        },
      ],
      ligatureCarets: [
        { glyph: 'f_i', carets: [250, 500] },
        { glyph: 'f_i', carets: [3], format: 'pointIndex' },
      ],
    })
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'glyphClass', id: 'glyph_class_raw_Bases' },
        { kind: 'glyphClass', id: 'glyph_class_raw_Ligatures' },
        { kind: 'glyphClass', id: 'glyph_class_raw_Marks' },
        { kind: 'glyphClass', id: 'glyph_class_raw_TopMarks' },
        { kind: 'gdef', id: 'gdef' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('table GDEF {')
    expect(generated).toContain('GlyphClassDef [A B], [f_i], [acutecomb], ;')
    expect(generated).toContain('MarkGlyphSetsDef [acutecomb gravecomb];')
    expect(generated).toContain('MarkGlyphSetsDef [dotaccent];')
    expect(generated).toContain('LigatureCaretByPos f_i 250 500;')
    expect(generated).toContain('LigatureCaretByIndex f_i 3;')
  })

  it('classifies raw UseMarkFilteringSet lookup flags', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Marks = [acutecomb gravecomb];',
          'lookup FilteredSub {',
          '  lookupflag IgnoreMarks UseMarkFilteringSet @Marks;',
          '  sub A by A.alt;',
          '} FilteredSub;',
          'feature salt {',
          '  lookup FilteredSub;',
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
        id: 'lookup_raw_FilteredSub',
        lookupFlag: {
          ignoreMarks: true,
          useMarkFilteringSet: true,
        },
        markFilteringSetClassId: 'glyph_class_raw_Marks',
      },
    ])
    expect(generateFea(state).text).toContain(
      'lookupflag IgnoreMarks UseMarkFilteringSet @Marks;'
    )
  })

  it('classifies raw MarkAttachmentType lookup flags', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Marks = [acutecomb gravecomb];',
          'feature salt {',
          '  lookupflag MarkAttachmentType @Marks;',
          '  sub A by A.alt;',
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
        id: 'lookup_raw_salt_0',
        lookupFlag: {
          markAttachmentType: true,
        },
        markAttachmentClassId: 'glyph_class_raw_Marks',
      },
    ])
    expect(generateFea(state).text).toContain(
      'lookupflag MarkAttachmentType @Marks;'
    )
  })

  it('preserves unsupported raw .fea source instead of partially committing it', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '# RAW SOURCE MARKER',
          'feature calt {',
          "  sub A' lookup SomeLookup B;",
          '} calt;',
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
        unsupportedStatementCount: 1,
      },
    })
    expect(state.features).toEqual([])
    expect(state.lookups).toEqual([])
    expect(
      (state.diagnostics ?? []).map((diagnostic) => diagnostic.id)
    ).toEqual(
      expect.arrayContaining([
        'feature-diagnostic-warning-raw-fea-parser-unsupported-statements',
      ])
    )
    expect(generateFea(state).text).toContain('RAW SOURCE MARKER')
  })

  it('preserves raw .fea when contextual rules reference unsupported lookup blocks', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'lookup BadLookup {',
          '  sub A by @Missing;',
          '} BadLookup;',
          'feature calt {',
          "  sub A' lookup BadLookup B;",
          '} calt;',
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
    expect(state.features).toEqual([])
    expect(state.lookups).toEqual([])
    expect(
      state.diagnostics?.some(
        (diagnostic) =>
          diagnostic.id ===
          'feature-diagnostic-warning-raw-fea-parser-unsupported-statements'
      )
    ).toBe(true)
  })
})
