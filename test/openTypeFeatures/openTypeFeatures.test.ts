import { describe, expect, it } from 'vitest'
import { applyAutoFeatureSuggestion } from 'src/lib/openTypeFeatures/applySuggestion'
import { buildAutoFeatureSuggestions } from 'src/lib/openTypeFeatures/buildAutoFeatureSuggestions'
import {
  canInstalledDependenciesCompileGeneratedFeaOffline,
  getInstalledCompilerDependencyCapabilities,
  getOpenTypeCompilerRuntimeRequirement,
} from 'src/lib/openTypeFeatures/compilerRuntimeCapabilities'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import {
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
  makeRuntimeNotConfiguredResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
import {
  mapCompilerErrorsToDiagnostics,
  mapFeaLineToDiagnosticTarget,
  parseCompilerErrorLocations,
} from 'src/lib/openTypeFeatures/compilerErrorMapping'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import {
  deriveOpenTypeExportWarnings,
  needsOpenTypeFeatureCompilationForBinaryExport,
  requiresDropUnsupportedConfirmation,
} from 'src/lib/openTypeFeatures/exportPolicy'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'
import type {
  AutoFeatureSuggestion,
  LookupRecord,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import type { FontData, GlyphData } from 'src/store/types'

const makeGlyph = (name: string, unicode?: string): GlyphData => ({
  id: name,
  name,
  paths: [],
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  unicodes: unicode ? [unicode] : [],
})

const makeFontData = (
  glyphs: Array<string | { name: string; unicode?: string }>
): FontData => {
  const glyphEntries = glyphs.map((glyph) => {
    const glyphData =
      typeof glyph === 'string'
        ? makeGlyph(glyph)
        : makeGlyph(glyph.name, glyph.unicode)
    return [glyphData.name, glyphData] as const
  })

  return {
    glyphs: Object.fromEntries(glyphEntries),
    glyphOrder: glyphEntries.map(([glyphName]) => glyphName),
    unitsPerEm: 1000,
  }
}

const makeSuggestions = (fontData: FontData) =>
  buildAutoFeatureSuggestions(fontData, createEmptyOpenTypeFeaturesState())

const findSuggestion = (
  suggestions: AutoFeatureSuggestion[],
  featureTag: string
) => {
  const suggestion = suggestions.find(
    (candidate) => candidate.featureTag === featureTag
  )
  expect(suggestion).toBeDefined()
  return suggestion as AutoFeatureSuggestion
}

const ruleReplacements = (lookup: LookupRecord) =>
  lookup.rules.map((rule) => {
    if (
      rule.kind !== 'ligatureSubstitution' &&
      rule.kind !== 'singleSubstitution'
    ) {
      throw new Error(`Unexpected rule kind in test fixture: ${rule.kind}`)
    }
    return rule.replacement
  })

const singleSubstitutionPairs = (lookup: LookupRecord) =>
  lookup.rules.map((rule) => {
    if (rule.kind !== 'singleSubstitution') {
      throw new Error(`Unexpected rule kind in test fixture: ${rule.kind}`)
    }
    if (rule.target.kind !== 'glyph') {
      throw new Error('Expected glyph selector in test fixture')
    }
    return `${rule.target.glyph}->${rule.replacement}`
  })

const makeStateWithRule = (rule: Rule): OpenTypeFeaturesState => ({
  ...createEmptyOpenTypeFeaturesState(),
  features: [
    {
      id: 'feature_liga',
      tag: 'liga',
      isActive: true,
      origin: 'manual',
      entries: [
        {
          id: 'entry_liga_DFLT_dflt',
          script: 'DFLT',
          language: 'dflt',
          lookupIds: ['lookup_liga_manual'],
        },
      ],
    },
  ],
  lookups: [
    {
      id: 'lookup_liga_manual',
      name: 'lookup_liga_manual',
      table: 'GSUB',
      lookupType: 'ligatureSubst',
      lookupFlag: {},
      rules: [rule],
      editable: true,
      origin: 'manual',
    },
  ],
})

describe('OpenType auto feature suggestions', () => {
  it('routes common and explicit ligatures to the expected features', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        'f',
        'i',
        'l',
        'c',
        't',
        'f_i',
        'f_l',
        'f_f',
        'f_f_i',
        'c_t',
        'c_t.liga',
        'c_t.dlig',
      ])
    )

    expect(
      ruleReplacements(findSuggestion(suggestions, 'liga').lookup)
    ).toEqual(['f_i', 'f_l', 'f_f', 'f_f_i', 'c_t.liga'])
    expect(
      ruleReplacements(findSuggestion(suggestions, 'dlig').lookup)
    ).toEqual(['c_t', 'c_t.dlig'])
  })

  it('builds stylistic set suggestions from ss01 and ss02 suffixes', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        'a',
        'a.ss01',
        'b',
        'b.ss01',
        'ampersand',
        'ampersand.ss02',
      ])
    )

    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'ss01').lookup)
    ).toEqual(['a->a.ss01', 'b->b.ss01'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'ss02').lookup)
    ).toEqual(['ampersand->ampersand.ss02'])
  })

  it('uses unicode metadata for small cap source classification', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        { name: 'smallSource', unicode: '0061' },
        { name: 'capSource', unicode: '0041' },
        'smallSource.sc',
        'capSource.sc',
      ])
    )

    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'smcp').lookup)
    ).toEqual(['smallSource->smallSource.sc'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'c2sc').lookup)
    ).toEqual(['capSource->capSource.sc'])
  })

  it('builds numeral feature suggestions from numeral suffixes', () => {
    const suggestions = makeSuggestions(
      makeFontData([
        'zero',
        'one',
        'zero.osf',
        'one.osf',
        'zero.lf',
        'one.lf',
        'zero.tf',
        'one.tf',
        'zero.pnum',
        'one.pnum',
      ])
    )

    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'onum').lookup)
    ).toEqual(['zero->zero.osf', 'one->one.osf'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'lnum').lookup)
    ).toEqual(['zero->zero.lf', 'one->one.lf'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'tnum').lookup)
    ).toEqual(['zero->zero.tf', 'one->one.tf'])
    expect(
      singleSubstitutionPairs(findSuggestion(suggestions, 'pnum').lookup)
    ).toEqual(['zero->zero.pnum', 'one->one.pnum'])
  })
})

describe('OpenType FEA source maps', () => {
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

  it('classifies raw mark classes and mark positioning lookup blocks', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          'languagesystem latn dflt;',
          'markClass acutecomb <anchor 0 520> @TOP;',
          'markClass gravecomb <anchor 10 510> @TOP;',
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
          { glyph: 'gravecomb', anchor: { x: 10, y: 510 } },
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
        { kind: 'markClass', id: 'mark_class_raw_TOP' },
        { kind: 'lookup', id: 'lookup_raw_MarkBase', table: 'GPOS' },
        { kind: 'lookup', id: 'lookup_raw_MarkLigature', table: 'GPOS' },
        { kind: 'lookup', id: 'lookup_raw_MarkMark', table: 'GPOS' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('markClass acutecomb <anchor 0 520> @TOP;')
    expect(generated).toContain('pos base A <anchor 300 700> mark @TOP;')
    expect(generated).toContain(
      'pos ligature f_i <anchor 200 700> mark @TOP ligComponent <anchor 420 700> mark @TOP;'
    )
    expect(generated).toContain('pos mark acutecomb <anchor 0 720> mark @TOP;')
  })

  it('classifies raw GDEF table glyph classes and ligature carets', () => {
    const state = classifyRawFeatureTextSource(
      setRawFeatureTextSource(
        createEmptyOpenTypeFeaturesState(),
        [
          '@Bases = [A B];',
          '@Ligatures = [f_i];',
          '@Marks = [acutecomb];',
          'table GDEF {',
          '  GlyphClassDef @Bases, @Ligatures, @Marks, ;',
          '  LigatureCaretByPos f_i 250 500;',
          '} GDEF;',
        ].join('\n')
      )
    )

    expect(state.sourceSections[0]).toMatchObject({
      id: 'source_raw_feature_text',
      stage: 'classified',
      status: 'classified',
    })
    expect(state.gdef).toEqual({
      glyphClasses: {
        base: ['A', 'B'],
        ligature: ['f_i'],
        mark: ['acutecomb'],
      },
      ligatureCarets: [{ glyph: 'f_i', carets: [250, 500] }],
    })
    expect(state.sourceSections[0]?.recordRefs).toEqual(
      expect.arrayContaining([
        { kind: 'glyphClass', id: 'glyph_class_raw_Bases' },
        { kind: 'glyphClass', id: 'glyph_class_raw_Ligatures' },
        { kind: 'glyphClass', id: 'glyph_class_raw_Marks' },
        { kind: 'gdef', id: 'gdef' },
      ])
    )

    const generated = generateFea(state).text
    expect(generated).toContain('table GDEF {')
    expect(generated).toContain('GlyphClassDef [A B], [f_i], [acutecomb], ;')
    expect(generated).toContain('LigatureCaretByPos f_i 250 500;')
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

  it('includes raw .fea source in generated FEA output', () => {
    const generated = generateFea({
      ...createEmptyOpenTypeFeaturesState(),
      rawFeatureText: '@Code = [hyphen greater];',
    })

    expect(generated.text).toContain('@Code = [hyphen greater];')
    expect(generated.text.indexOf('@Code = [hyphen greater];')).toBeLessThan(
      generated.text.indexOf('languagesystem DFLT dflt;')
    )
  })

  it('emits trace comments and source map entries for generated rules', () => {
    const generated = generateFea(
      makeStateWithRule({
        id: 'rule_f_i',
        kind: 'ligatureSubstitution',
        components: ['f', 'i'],
        replacement: 'f_i',
        meta: { origin: 'manual' },
      })
    )

    expect(generated.text).toContain('# kumiko-rule-id: rule_f_i')
    expect(generated.text).toContain('sub f i by f_i;')
    expect(
      generated.sourceMap.entries.some((entry) => entry.ruleId === 'rule_f_i')
    ).toBe(true)
  })

  it('serializes nested lookup blocks before contextual references', () => {
    const state: OpenTypeFeaturesState = {
      ...createEmptyOpenTypeFeaturesState(),
      features: [
        {
          id: 'feature_calt',
          tag: 'calt',
          isActive: true,
          origin: 'manual',
          entries: [
            {
              id: 'entry_calt_DFLT_dflt',
              script: 'DFLT',
              language: 'dflt',
              lookupIds: ['lookup_parent'],
            },
          ],
        },
      ],
      lookups: [
        {
          id: 'lookup_parent',
          name: 'lookup_parent',
          table: 'GSUB',
          lookupType: 'chainingContextSubst',
          lookupFlag: {},
          rules: [
            {
              id: 'rule_context',
              kind: 'contextualSubstitution',
              mode: 'chaining',
              backtrack: [],
              input: [
                {
                  selector: { kind: 'glyph', glyph: 'A' },
                  lookupIds: ['lookup_helper'],
                },
              ],
              lookahead: [{ kind: 'glyph', glyph: 'B' }],
              meta: { origin: 'manual' },
            },
          ],
          editable: true,
          origin: 'manual',
        },
        {
          id: 'lookup_helper',
          name: 'lookup_helper',
          table: 'GSUB',
          lookupType: 'singleSubst',
          lookupFlag: {},
          rules: [
            {
              id: 'rule_helper',
              kind: 'singleSubstitution',
              target: { kind: 'glyph', glyph: 'A' },
              replacement: 'A.alt',
              meta: { origin: 'manual' },
            },
          ],
          editable: true,
          origin: 'manual',
        },
      ],
    }
    const generated = generateFea(state).text

    expect(generated.indexOf('lookup lookup_helper {')).toBeLessThan(
      generated.indexOf('lookup lookup_parent {')
    )
    expect(generated).toContain("sub A' lookup lookup_helper B;")
  })

  it('serializes contextual substitution rules without lookup records as ignore rules', () => {
    const generated = generateFea(
      makeStateWithRule({
        id: 'rule_ignore_context',
        kind: 'contextualSubstitution',
        mode: 'chaining',
        backtrack: [{ kind: 'glyph', glyph: 'less' }],
        input: [{ selector: { kind: 'glyph', glyph: 'less' } }],
        lookahead: [
          { kind: 'glyph', glyph: 'exclam' },
          { kind: 'glyph', glyph: 'hyphen' },
        ],
        meta: { origin: 'manual' },
      })
    )

    expect(generated.text).toContain("ignore sub less less' exclam hyphen;")
  })

  it('serializes glyph class selectors with their FEA class names', () => {
    const state: OpenTypeFeaturesState = {
      ...createEmptyOpenTypeFeaturesState(),
      features: [
        {
          id: 'feature_kern',
          tag: 'kern',
          isActive: true,
          origin: 'manual',
          entries: [
            {
              id: 'entry_kern_DFLT_dflt',
              script: 'DFLT',
              language: 'dflt',
              lookupIds: ['lookup_kern'],
            },
          ],
        },
      ],
      glyphClasses: [
        {
          id: 'class_left',
          name: '@Left',
          glyphs: ['A', 'B'],
          origin: 'manual',
        },
        {
          id: 'class_right',
          name: '@Right',
          glyphs: ['V', 'W'],
          origin: 'manual',
        },
      ],
      lookups: [
        {
          id: 'lookup_kern',
          name: 'lookup_kern',
          table: 'GPOS',
          lookupType: 'pairPos',
          lookupFlag: {},
          rules: [
            {
              id: 'rule_class_kern',
              kind: 'pairPositioning',
              left: { kind: 'class', classId: 'class_left' },
              right: { kind: 'class', classId: 'class_right' },
              firstValue: { xAdvance: -80 },
              meta: { origin: 'manual' },
            },
          ],
          editable: true,
          origin: 'manual',
        },
      ],
    }
    const generated = generateFea(state).text

    expect(generated).toContain('@Left = [A B];')
    expect(generated).toContain('@Right = [V W];')
    expect(generated).toContain('pos @Left @Right -80;')
    expect(generated).not.toContain('pos class_left class_right -80;')
  })

  it('omits script and language statements inside aalt feature blocks', () => {
    const state = makeStateWithRule({
      id: 'rule_A_alt',
      kind: 'singleSubstitution',
      target: { kind: 'glyph', glyph: 'A' },
      replacement: 'A.alt',
      meta: { origin: 'manual' },
    })
    state.features[0] = {
      ...state.features[0],
      id: 'feature_aalt',
      tag: 'aalt',
      entries: [
        {
          id: 'entry_aalt_DFLT_dflt',
          script: 'DFLT',
          language: 'dflt',
          lookupIds: ['lookup_liga_manual'],
        },
        {
          id: 'entry_aalt_latn_dflt',
          script: 'latn',
          language: 'dflt',
          lookupIds: ['lookup_liga_manual'],
        },
      ],
    }

    const aaltBlock = generateFea(state).text.match(
      /feature aalt \{[\s\S]*?\} aalt;/
    )?.[0]

    expect(aaltBlock).toBeDefined()
    expect(aaltBlock).not.toContain('script ')
    expect(aaltBlock).not.toContain('language ')
    expect(aaltBlock?.match(/lookup lookup_liga_manual;/g)).toHaveLength(1)
  })

  it('keeps accepted suggestions available to FEA generation', () => {
    const suggestion = findSuggestion(
      makeSuggestions(makeFontData(['f', 'i', 'f_i'])),
      'liga'
    )
    const generated = generateFea(
      applyAutoFeatureSuggestion(createEmptyOpenTypeFeaturesState(), suggestion)
    )

    expect(generated.text).toContain('sub f i by f_i;')
    expect(generated.sourceMap.entries.length > 0).toBe(true)
  })

  it('maps compiler line numbers back to generated rule diagnostics', () => {
    const generated = generateFea(
      makeStateWithRule({
        id: 'rule_f_i',
        kind: 'ligatureSubstitution',
        components: ['f', 'i'],
        replacement: 'f_i',
        meta: { origin: 'manual' },
      })
    )
    const ruleLine =
      generated.text
        .split('\n')
        .findIndex((line) => line.trim() === 'sub f i by f_i;') + 1

    expect(mapFeaLineToDiagnosticTarget(generated.sourceMap, ruleLine)).toEqual(
      {
        kind: 'rule',
        ruleId: 'rule_f_i',
      }
    )
  })

  it('parses fontTools-style FEA error locations', () => {
    expect(
      parseCompilerErrorLocations(
        'features.fea:12:7: Expected glyph name\nline 18, column 3: Bad lookup'
      )
    ).toEqual([
      {
        column: 7,
        line: 12,
        message: 'features.fea:12:7: Expected glyph name',
      },
      {
        column: 3,
        line: 18,
        message: 'line 18, column 3: Bad lookup',
      },
    ])
  })

  it('builds mapped compiler diagnostics from source map entries', () => {
    const sourceMap = {
      entries: [
        {
          featureId: 'feature_liga',
          lineStart: 4,
          lineEnd: 12,
        },
        {
          lookupId: 'lookup_liga_manual',
          lineStart: 6,
          lineEnd: 11,
        },
        {
          ruleId: 'rule_f_i',
          lineStart: 9,
          lineEnd: 9,
        },
      ],
    }

    expect(
      mapCompilerErrorsToDiagnostics({
        fallbackMessage: 'Compilation failed',
        rawCompilerOutput: 'features.fea:9:5: Unknown glyph "f_i"',
        sourceMap,
      })
    ).toMatchObject([
      {
        message: 'features.fea:9:5: Unknown glyph "f_i"',
        severity: 'error',
        target: {
          kind: 'rule',
          ruleId: 'rule_f_i',
        },
      },
    ])
  })
})

describe('OpenType compiler runtime scaffold', () => {
  it('documents the configured Pyodide fontTools compiler runtime', () => {
    expect(canInstalledDependenciesCompileGeneratedFeaOffline()).toBe(true)

    expect(getInstalledCompilerDependencyCapabilities()).toEqual([
      expect.objectContaining({
        dependency: 'opentype.js',
        status: 'insufficient',
        missingCapabilities: expect.arrayContaining([
          'Parse generated .fea feature-file syntax.',
        ]),
      }),
      expect.objectContaining({
        dependency: 'fonteditor-core',
        status: 'insufficient',
        missingCapabilities: expect.arrayContaining([
          'Rebuild GSUB, GPOS, and GDEF tables from editable feature rules.',
        ]),
      }),
      expect.objectContaining({
        dependency: 'pyodide-fonttools',
        status: 'available',
        missingCapabilities: [],
      }),
    ])

    expect(getOpenTypeCompilerRuntimeRequirement()).toMatchObject({
      canCompileGeneratedFeaWithInstalledDependencies: true,
      recommendedBackends: ['pyodide-fonttools', 'wasm-fonttools'],
    })
  })

  it('reports a ready Pyodide compiler status by default', () => {
    expect(createCompilerRuntimeStatus()).toEqual({
      backend: 'pyodide-fonttools',
      canCompile: true,
      message:
        'OpenType feature compilation is available through a lazy-loaded Pyodide fontTools worker runtime.',
      state: 'ready',
    })
  })

  it('can still construct an explicit not-configured compiler status', () => {
    expect(createCompilerRuntimeStatus('not-configured')).toEqual({
      backend: 'not-configured',
      canCompile: false,
      message:
        'OpenType feature compilation is not configured yet. Generated FEA can be inspected, but binary layout compilation needs an offline WASM font compiler runtime.',
      state: 'not-configured',
    })
  })

  it('returns structured diagnostics when no compiler runtime is configured', () => {
    const response = makeRuntimeNotConfiguredResponse()

    expect(response.type).toBe('compile-error')
    expect(response.payload.backend).toBe('not-configured')
    expect(response.payload.runtimeStatus.canCompile).toBe(false)
    expect(response.payload.diagnostics).toMatchObject([
      {
        severity: 'error',
        target: { kind: 'global' },
      },
    ])
  })

  it('can create mapped compiler error payloads without a runtime', () => {
    const runtimeStatus = createCompilerRuntimeStatus('pyodide-fonttools')
    const response = makeCompilerErrorResponse({
      backend: runtimeStatus.backend,
      message: 'fontTools compilation failed',
      rawCompilerOutput: 'features.fea:21:1: Unknown lookup',
      runtimeStatus,
      sourceMap: {
        entries: [
          {
            lookupId: 'lookup_kern_imported',
            lineStart: 20,
            lineEnd: 24,
          },
        ],
      },
    })

    expect(response.payload.diagnostics).toMatchObject([
      {
        severity: 'error',
        target: {
          kind: 'lookup',
          lookupId: 'lookup_kern_imported',
        },
      },
    ])
  })
})

describe('OpenType binary export compiler gate', () => {
  it('requires compiler runtime for managed binary feature edits', () => {
    const state = makeStateWithRule({
      id: 'rule_f_i',
      kind: 'ligatureSubstitution',
      components: ['f', 'i'],
      replacement: 'f_i',
      meta: { origin: 'manual' },
    })

    expect(needsOpenTypeFeatureCompilationForBinaryExport(state)).toBe(true)
    expect(
      needsOpenTypeFeatureCompilationForBinaryExport({
        ...state,
        exportPolicy: 'preserve-compiled-layout-tables',
      })
    ).toBe(false)
    expect(
      needsOpenTypeFeatureCompilationForBinaryExport(
        createEmptyOpenTypeFeaturesState()
      )
    ).toBe(false)
  })

  it('warns when binary feature compilation would need an unavailable runtime', () => {
    const warnings = deriveOpenTypeExportWarnings(
      makeStateWithRule({
        id: 'rule_f_i',
        kind: 'ligatureSubstitution',
        components: ['f', 'i'],
        replacement: 'f_i',
        meta: { origin: 'manual' },
      }),
      {
        compilerRuntimeStatus: createCompilerRuntimeStatus('not-configured'),
        diagnostics: [],
      }
    )

    expect(
      warnings.some(
        (warning) => warning.code === 'compiler-runtime-not-configured'
      )
    ).toBe(true)
  })

  it('marks drop-unsupported rebuilds as requiring explicit confirmation', () => {
    const warnings = deriveOpenTypeExportWarnings(
      {
        ...createEmptyOpenTypeFeaturesState(),
        exportPolicy: 'drop-unsupported-and-rebuild',
        unsupportedLookups: [
          {
            id: 'unsupported_gsub_0',
            table: 'GSUB',
            lookupIndex: 0,
            lookupType: 6,
            subtableFormats: [3],
            reason: 'Chaining contextual substitution is not editable yet.',
            rawSummary: 'GSUB type 6 formats 3',
            preserveMode: 'drop-on-rebuild',
            provenance: {
              table: 'GSUB',
              lookupIndex: 0,
              lookupType: 6,
            },
          },
        ],
      },
      {
        compilerRuntimeStatus: createCompilerRuntimeStatus(),
        diagnostics: [],
      }
    )

    expect(requiresDropUnsupportedConfirmation(warnings)).toBe(true)
    expect(
      warnings.find(
        (warning) => warning.code === 'drop-unsupported-requires-confirmation'
      )?.details
    ).toEqual([
      'GSUB lookup 0: Chaining contextual substitution is not editable yet. (GSUB type 6 formats 3)',
    ])
  })
})
