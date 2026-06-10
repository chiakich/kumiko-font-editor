import { describe, expect, it } from 'vitest'
import { gitBlobShaFromText } from 'src/lib/githubSync/gitBlobSha'

describe('gitBlobShaFromText', () => {
  it('matches git hash-object for ascii content', async () => {
    // $ printf 'hello\n' | git hash-object --stdin
    expect(await gitBlobShaFromText('hello\n')).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a'
    )
  })

  it('matches git hash-object for empty content', async () => {
    expect(await gitBlobShaFromText('')).toBe(
      'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391'
    )
  })

  it('hashes utf-8 byte length, not string length', async () => {
    // $ printf '火\n' | git hash-object --stdin
    expect(await gitBlobShaFromText('火\n')).toBe(
      '0d1ab016cc3d3db7cbf6b9a4d5f9f97a58ec33c4'
    )
  })
})
