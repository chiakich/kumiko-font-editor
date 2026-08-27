import { describe, expect, it } from 'vitest'
import {
  buildPlaceholderText,
  parsePreviewSegments,
  PREVIEW_GLYPH_PLACEHOLDER,
} from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewTokens'

describe('preview glyph tokens', () => {
  it('parses /name tokens out of the text', () => {
    expect(parsePreviewSegments('永/comma.vert 字')).toEqual([
      { kind: 'text', text: '永' },
      { kind: 'glyph', name: 'comma.vert' },
      { kind: 'text', text: '字' },
    ])
  })

  it('consumes exactly one separating space after a token', () => {
    expect(parsePreviewSegments('/a  b')).toEqual([
      { kind: 'glyph', name: 'a' },
      { kind: 'text', text: ' b' },
    ])
    expect(parsePreviewSegments('/a')).toEqual([{ kind: 'glyph', name: 'a' }])
  })

  it('leaves a bare slash as text', () => {
    expect(parsePreviewSegments('1/2 // ')).toEqual([
      { kind: 'text', text: '1' },
      { kind: 'glyph', name: '2' },
      { kind: 'text', text: '// ' },
    ])
    expect(parsePreviewSegments('a/ b')).toEqual([
      { kind: 'text', text: 'a/ b' },
    ])
  })

  it('maps each token to its placeholder cluster', () => {
    const { text, tokensByCluster } = buildPlaceholderText([
      { kind: 'text', text: '永' },
      { kind: 'glyph', name: 'comma.vert' },
      { kind: 'glyph', name: 'a.ss01' },
    ])
    expect(text).toBe(
      `永${PREVIEW_GLYPH_PLACEHOLDER}${PREVIEW_GLYPH_PLACEHOLDER}`
    )
    expect(tokensByCluster.get(1)).toBe('comma.vert')
    expect(tokensByCluster.get(2)).toBe('a.ss01')
  })
})
