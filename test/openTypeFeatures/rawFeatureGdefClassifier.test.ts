import { describe, expect, it } from 'vitest'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'

describe('OpenType raw FEA GDEF classifier', () => {
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
    expect(generated).not.toMatch(/^\s*MarkGlyphSetsDef/m)
    expect(generated).toContain(
      '# MarkGlyphSets @TopMarks = [acutecomb gravecomb]'
    )
    expect(generated).toContain(
      '# MarkGlyphSets @GDEFMarkGlyphSet1 = [dotaccent]'
    )
    expect(generated).toContain('LigatureCaretByPos f_i 250 500;')
    expect(generated).toContain('LigatureCaretByIndex f_i 3;')
  })
})
