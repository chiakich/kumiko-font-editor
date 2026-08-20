// Commit messages are what a maintainer reads in the PR list, so they name the
// glyphs by the character itself: "Add '珢'" beats "Add uni73E2".

export interface CommitMessageGlyph {
  glyphName: string
  unicodes?: readonly string[]
}

const MAX_LISTED_GLYPHS = 5

// A codepoint only stands in for the glyph when it actually shows something:
// space, control characters and combining marks read as a blank or a stray mark
// on their own, so those keep the glyph name.
const isSelfExplanatoryCharacter = (codePoint: number) => {
  const char = String.fromCodePoint(codePoint)
  if (/^[\s\p{C}\p{M}\p{Z}]$/u.test(char)) {
    return false
  }
  return true
}

export const describeGlyphForCommit = (glyph: CommitMessageGlyph) => {
  const hex = glyph.unicodes?.[0]
  const codePoint = hex ? Number.parseInt(hex, 16) : Number.NaN
  if (Number.isFinite(codePoint) && isSelfExplanatoryCharacter(codePoint)) {
    return `'${String.fromCodePoint(codePoint)}'`
  }
  return `'${glyphName(glyph)}'`
}

const glyphName = (glyph: CommitMessageGlyph) => glyph.glyphName

const clause = (verb: string, glyphs: readonly CommitMessageGlyph[]) => {
  if (glyphs.length === 0) {
    return null
  }
  const listed = glyphs.slice(0, MAX_LISTED_GLYPHS).map(describeGlyphForCommit)
  const rest = glyphs.length - listed.length
  return `${verb} ${listed.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`
}

export const buildGlyphCommitMessage = (input: {
  added?: readonly CommitMessageGlyph[]
  updated?: readonly CommitMessageGlyph[]
  deleted?: readonly CommitMessageGlyph[]
  // Used when the change touches no glyph at all (font info, kerning, features).
  fallbackTitle: string
}) => {
  const clauses = [
    clause('Add', input.added ?? []),
    clause('Update', input.updated ?? []),
    clause('Delete', input.deleted ?? []),
  ].filter((entry): entry is string => entry !== null)

  return clauses.length > 0
    ? clauses.join('; ')
    : `Update ${input.fallbackTitle}`
}
