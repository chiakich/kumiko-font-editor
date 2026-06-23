import { describe, expect, it } from 'vitest'
import {
  findSuggestion,
  makeFontData,
  makeSuggestions,
  ruleReplacements,
  singleSubstitutionPairs,
} from './openTypeFeatureTestHelpers'

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
