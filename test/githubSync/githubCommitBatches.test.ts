import { describe, expect, it } from 'vitest'

import {
  GITHUB_COMMIT_BATCH_LIMITS,
  splitCommitFiles,
} from '@/lib/github/githubCommitBatches'

const file = (name: string, content: string) => ({
  path: `sources/Font.ufo/glyphs/${name}.glif`,
  content,
})

describe('splitCommitFiles', () => {
  it('keeps a small commit in a single request', () => {
    const batches = splitCommitFiles([file('A', 'x'), file('B', 'y')])
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
  })

  it('splits on the file count limit', () => {
    const files = Array.from({ length: 1201 }, (_, index) =>
      file(`glyph${index}`, 'x')
    )
    const batches = splitCommitFiles(files)
    expect(batches).toHaveLength(3)
    expect(batches.flat()).toHaveLength(1201)
    expect(batches.map((batch) => batch.length)).toEqual([500, 500, 201])
  })

  it('splits on the byte budget before the file count', () => {
    const bigContent = 'x'.repeat(GITHUB_COMMIT_BATCH_LIMITS.maxBytes / 4)
    const batches = splitCommitFiles(
      Array.from({ length: 9 }, (_, index) => file(`glyph${index}`, bigContent))
    )
    expect(batches.length).toBeGreaterThan(2)
    expect(batches.flat()).toHaveLength(9)
    expect(
      batches.every((batch) => batch.length <= 4 && batch.length > 0)
    ).toBe(true)
  })

  it('gives a single oversized file its own batch rather than dropping it', () => {
    const huge = file(
      'huge',
      'x'.repeat(GITHUB_COMMIT_BATCH_LIMITS.maxBytes * 2)
    )
    const batches = splitCommitFiles([file('A', 'x'), huge, file('B', 'y')])
    expect(batches.flat()).toHaveLength(3)
    expect(batches.some((batch) => batch.includes(huge))).toBe(true)
  })

  it('returns no batches for an empty commit', () => {
    expect(splitCommitFiles([])).toEqual([])
  })
})
