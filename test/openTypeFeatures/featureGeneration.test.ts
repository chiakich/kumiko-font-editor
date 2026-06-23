import { describe, expect, it } from 'vitest'
import { applyAutoFeatureSuggestion } from 'src/lib/openTypeFeatures/applySuggestion'
import { mapFeaLineToDiagnosticTarget } from 'src/lib/openTypeFeatures/compilerErrorMapping'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { generateFea } from 'src/lib/openTypeFeatures/generateFea'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures/types'
import {
  findSuggestion,
  makeFontData,
  makeStateWithRule,
  makeSuggestions,
} from './openTypeFeatureTestHelpers'

describe('OpenType FEA generation', () => {
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
})
