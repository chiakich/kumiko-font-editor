import { describe, expect, it } from 'vitest'

import {
  buildGlyphCommitMessage,
  describeGlyphForCommit,
} from '@/lib/github/sync/commitMessage'

describe('describeGlyphForCommit', () => {
  it('names a glyph by its character, not its unicode name', () => {
    expect(
      describeGlyphForCommit({ glyphName: 'uni73E2', unicodes: ['73E2'] })
    ).toBe("'珢'")
    expect(describeGlyphForCommit({ glyphName: 'A', unicodes: ['0041'] })).toBe(
      "'A'"
    )
  })

  it('falls back to the glyph name when the character shows nothing', () => {
    // space, a combining mark and an unencoded glyph would all read as blank
    expect(
      describeGlyphForCommit({ glyphName: 'space', unicodes: ['0020'] })
    ).toBe("'space'")
    expect(
      describeGlyphForCommit({ glyphName: 'gravecomb', unicodes: ['0300'] })
    ).toBe("'gravecomb'")
    expect(describeGlyphForCommit({ glyphName: 'A.alt' })).toBe("'A.alt'")
  })
})

describe('buildGlyphCommitMessage', () => {
  const glyph = (name: string, hex?: string) => ({
    glyphName: name,
    unicodes: hex ? [hex] : undefined,
  })

  it('separates additions from edits', () => {
    expect(
      buildGlyphCommitMessage({
        added: [glyph('uni73E2', '73E2')],
        fallbackTitle: 'JYRounded',
      })
    ).toBe("Add '珢'")
    expect(
      buildGlyphCommitMessage({
        updated: [glyph('uni73E2', '73E2')],
        fallbackTitle: 'JYRounded',
      })
    ).toBe("Update '珢'")
  })

  it('lists several glyphs and states how many are left out', () => {
    expect(
      buildGlyphCommitMessage({
        added: [
          glyph('uni73E2', '73E2'),
          glyph('uni73E3', '73E3'),
          glyph('uni73E4', '73E4'),
          glyph('uni73E5', '73E5'),
          glyph('uni73E6', '73E6'),
          glyph('uni73E7', '73E7'),
          glyph('uni73E8', '73E8'),
        ],
        fallbackTitle: 'JYRounded',
      })
    ).toBe("Add '珢', '珣', '珤', '珥', '珦' and 2 more")
  })

  it('combines the kinds of change in one line', () => {
    expect(
      buildGlyphCommitMessage({
        added: [glyph('uni73E2', '73E2')],
        updated: [glyph('A', '0041')],
        deleted: [glyph('B', '0042')],
        fallbackTitle: 'JYRounded',
      })
    ).toBe("Add '珢'; Update 'A'; Delete 'B'")
  })

  it('falls back to the project title when no glyph changed', () => {
    expect(buildGlyphCommitMessage({ fallbackTitle: 'JYRounded' })).toBe(
      'Update JYRounded'
    )
  })
})
