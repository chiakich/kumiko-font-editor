// The preview input's escape syntax: `/glyphName` places a glyph the text
// itself cannot reach (comma.vert, ss-variants, unencoded glyphs). A slash
// followed by glyph-name characters is a token; one space after the name is
// the separator and is consumed, matching FontGoggles' convention.

export type PreviewSegment =
  | { kind: 'text'; text: string }
  | { kind: 'glyph'; name: string }

const GLYPH_NAME_CHAR = /[A-Za-z0-9_.-]/

export const parsePreviewSegments = (input: string): PreviewSegment[] => {
  const segments: PreviewSegment[] = []
  let text = ''
  const flush = () => {
    if (text) {
      segments.push({ kind: 'text', text })
      text = ''
    }
  }
  let index = 0
  while (index < input.length) {
    const char = input[index]
    if (char === '/') {
      let end = index + 1
      while (end < input.length && GLYPH_NAME_CHAR.test(input[end])) {
        end += 1
      }
      const name = input.slice(index + 1, end)
      if (name) {
        flush()
        segments.push({ kind: 'glyph', name })
        // One space directly after the name separates it from following text.
        index = input[end] === ' ' ? end + 1 : end
        continue
      }
    }
    text += char
    index += 1
  }
  flush()
  return segments
}

// U+FFFC stands in for each glyph token in the shaped text; the shaper swaps
// the placeholder's glyph for the named one afterwards, so surrounding text
// still shapes with its full context.
export const PREVIEW_GLYPH_PLACEHOLDER = '￼'

export interface PlaceholderText {
  text: string
  // UTF-16 index (= HarfBuzz cluster) of each token's placeholder → its name.
  tokensByCluster: Map<number, string>
}

export const buildPlaceholderText = (
  segments: readonly PreviewSegment[]
): PlaceholderText => {
  let text = ''
  const tokensByCluster = new Map<number, string>()
  for (const segment of segments) {
    if (segment.kind === 'text') {
      text += segment.text
    } else {
      tokensByCluster.set(text.length, segment.name)
      text += PREVIEW_GLYPH_PLACEHOLDER
    }
  }
  return { text, tokensByCluster }
}
