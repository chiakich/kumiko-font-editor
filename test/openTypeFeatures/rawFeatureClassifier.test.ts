import { describe, expect, it } from 'vitest'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'
import { getRawFeatureText } from 'src/lib/openTypeFeatures/rawFeatureSnippets'

describe('OpenType raw FEA classifier', () => {
  it('tracks raw .fea text as a formal feature source section', () => {
    const state = setRawFeatureTextSource(
      createEmptyOpenTypeFeaturesState(),
      '@Code = [hyphen greater];'
    )

    expect(getRawFeatureText(state)).toBe('@Code = [hyphen greater];')
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

  it('classifies long-form substitute and position statement keywords', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'feature liga {',
          '  script latn;',
          '  language dflt;',
          '  substitute f i by f_i;',
          '} liga;',
          'feature kern {',
          '  script latn;',
          '  language dflt;',
          '  position A V -80;',
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
        id: 'lookup_raw_liga_0',
        lookupType: 'ligatureSubst',
        rules: [{ kind: 'ligatureSubstitution' }],
      },
      {
        id: 'lookup_raw_kern_1',
        lookupType: 'pairPos',
        rules: [{ kind: 'pairPositioning' }],
      },
    ])

    const generated = generateFea(state).text
    expect(generated).toContain('sub f i by f_i;')
    expect(generated).toContain('pos A V -80;')
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

  it('classifies numeric raw lookup flags for supported low bits', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'feature salt {',
          '  lookupflag 9;',
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
          rightToLeft: true,
          ignoreMarks: true,
        },
      },
    ])
    expect(generateFea(state).text).toContain(
      'lookupflag RightToLeft IgnoreMarks;'
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
