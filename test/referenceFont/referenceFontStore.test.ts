import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadReferenceFontFromBytes } from '@/lib/referenceFont/referenceFontStore'

const readFixture = (path: string) => {
  const buffer = readFileSync(path)
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
}

describe('reference font display names', () => {
  it('reads nested OpenType platform name records before falling back to the file name', () => {
    const name = loadReferenceFontFromBytes(
      readFixture('test/fixtures/otf/PublicSans-Regular.otf'),
      'PublicSans-Regular',
      'zh-TW'
    )

    expect(name).toBe('Public Sans')
  })
})
