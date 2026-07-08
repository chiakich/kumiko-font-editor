import { describe, expect, it } from 'vitest'
import {
  getRawFeatureText,
  joinRawFeatureSnippets,
  normalizeRawFeatureSnippets,
  splitRawFeatureTextIntoSnippets,
} from 'src/lib/openTypeFeatures/rawFeatureSnippets'
import { setRawFeatureTextSource } from 'src/lib/openTypeFeatures/featureSourceSections'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'

const SAMPLE = [
  '@Lower = [a b c];',
  'languagesystem DFLT dflt;',
  '',
  'feature liga {',
  '  sub f i by f_i;',
  '} liga;',
  '',
  '@Upper = [A B C];',
  '',
  'feature ss01 {',
  '  sub a by a.ss01;',
  '} ss01;',
].join('\n')

describe('raw feature snippets', () => {
  it('splits raw FEA text into prefix and feature snippets', () => {
    const snippets = splitRawFeatureTextIntoSnippets(SAMPLE)

    expect(snippets.map((snippet) => [snippet.kind, snippet.tag])).toEqual([
      ['prefix', undefined],
      ['feature', 'liga'],
      ['prefix', undefined],
      ['feature', 'ss01'],
    ])
    expect(snippets[0].text).toBe(
      '@Lower = [a b c];\nlanguagesystem DFLT dflt;'
    )
    expect(snippets[1].id).toBe('snippet_feature_liga')
    expect(snippets[1].text).toBe('feature liga {\n  sub f i by f_i;\n} liga;')
  })

  it('keeps duplicate feature tags with unique snippet ids', () => {
    const snippets = splitRawFeatureTextIntoSnippets(
      'feature liga { sub f i by f_i; } liga;\nfeature liga { sub f l by f_l; } liga;'
    )
    expect(snippets.map((snippet) => snippet.id)).toEqual([
      'snippet_feature_liga',
      'snippet_feature_liga_2',
    ])
  })

  it('joins snippets back to equivalent source text', () => {
    const snippets = splitRawFeatureTextIntoSnippets(SAMPLE)
    const joined = joinRawFeatureSnippets(snippets)
    expect(joined).toContain('@Lower = [a b c];')
    expect(joined).toContain('feature liga {')
    expect(joined).toContain('@Upper = [A B C];')
    expect(joined).toContain('feature ss01 {')
    expect(splitRawFeatureTextIntoSnippets(joined)).toEqual(snippets)
  })

  it('stores snippets when setting the raw feature text source', () => {
    const state = setRawFeatureTextSource(
      createEmptyOpenTypeFeaturesState(),
      SAMPLE
    )
    expect(state.rawFeatureText).toBeUndefined()
    expect(state.rawFeatureSnippets).toHaveLength(4)
    expect(getRawFeatureText(state)).toContain('feature ss01 {')
  })

  it('clears snippets when setting empty text', () => {
    const state = setRawFeatureTextSource(
      setRawFeatureTextSource(createEmptyOpenTypeFeaturesState(), SAMPLE),
      ''
    )
    expect(state.rawFeatureSnippets).toBeUndefined()
    expect(getRawFeatureText(state)).toBeUndefined()
    expect(
      state.sourceSections.some(
        (section) => section.textRef === 'rawFeatureText'
      )
    ).toBe(false)
  })

  it('migrates the legacy rawFeatureText blob into snippets', () => {
    const legacyState = {
      ...createEmptyOpenTypeFeaturesState(),
      rawFeatureText: SAMPLE,
    }
    const migrated = normalizeRawFeatureSnippets(legacyState)
    expect(migrated.rawFeatureText).toBeUndefined()
    expect(migrated.rawFeatureSnippets).toHaveLength(4)
    expect(getRawFeatureText(migrated)).toContain('feature liga {')

    expect(normalizeRawFeatureSnippets(migrated)).toBe(migrated)
  })
})
