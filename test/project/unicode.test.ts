import { describe, expect, it } from 'vitest'
import {
  normalizeUnicodeHex,
  unicodeHexToCharacter,
  unicodeHexToCodePoint,
} from '@/lib/project/unicode'

describe('unicode normalization', () => {
  it('normalizes numeric values as decimal code points', () => {
    expect(normalizeUnicodeHex(65)).toBe('0041')
    expect(normalizeUnicodeHex(983046)).toBe('F0006')
  })

  it('normalizes string values as hex code points', () => {
    expect(normalizeUnicodeHex('0041')).toBe('0041')
    expect(normalizeUnicodeHex('U+F0006')).toBe('F0006')
    expect(unicodeHexToCodePoint('F0006')).toBe(0xf0006)
    expect(unicodeHexToCharacter('F0006')).toBe(String.fromCodePoint(0xf0006))
  })

  it('rejects invalid unicode scalars and non-hex strings', () => {
    expect(normalizeUnicodeHex('983046')).toBeNull()
    expect(normalizeUnicodeHex('110000')).toBeNull()
    expect(normalizeUnicodeHex('D800')).toBeNull()
    expect(normalizeUnicodeHex('0041abcxyz')).toBeNull()
    expect(unicodeHexToCharacter('110000')).toBeNull()
  })
})
