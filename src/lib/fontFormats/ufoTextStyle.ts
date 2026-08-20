// UFO files are compared by blob OID during git sync, so writing the same data
// with different whitespace reads as "every file changed". Producers disagree on
// details the format does not fix: fontTools writes `<tag/>` with a
// single-quoted XML declaration and tab-indented plists, Glyphs writes `<tag />`
// and two-space plists with the root container indented. Neither is more
// correct, so the style is detected from the source and reproduced on write.
export interface UfoTextStyle {
  xmlQuote: '"' | "'"
  // `<tag attr="v" />` instead of `<tag attr="v"/>`
  selfClosingSpace: boolean
  plistIndent: string
  // whether the <dict>/<array> directly under <plist> is indented
  plistIndentRoot: boolean
  // Glyphs writes &quot; inside plist strings; fontTools leaves the quote as is.
  // XML requires neither, so this only matters for byte fidelity.
  escapeQuotesInText: boolean
}

export const UFOLIB_TEXT_STYLE: UfoTextStyle = {
  xmlQuote: "'",
  selfClosingSpace: false,
  plistIndent: '\t',
  plistIndentRoot: false,
  escapeQuotesInText: false,
}

const detectXmlQuote = (text: string): UfoTextStyle['xmlQuote'] =>
  /^<\?xml\s+version='/.test(text) ? "'" : '"'

const indentOf = (line: string) => /^[\t ]*/.exec(line)?.[0] ?? ''

// The first indented line names the indent unit: one level deep in a plist.
const detectPlistIndent = (text: string) => {
  const lines = text.split('\n')
  for (const line of lines) {
    if (!line.trim() || line.startsWith('<')) {
      continue
    }
    const indent = indentOf(line)
    if (indent) {
      return indent.startsWith('\t') ? '\t' : indent
    }
  }
  return UFOLIB_TEXT_STYLE.plistIndent
}

const detectPlistIndentRoot = (text: string) => {
  const lines = text.split('\n')
  const plistIndex = lines.findIndex((line) => line.startsWith('<plist'))
  const rootLine = plistIndex >= 0 ? lines[plistIndex + 1] : undefined
  return Boolean(rootLine && indentOf(rootLine).length > 0)
}

// Both samples are optional: a UFO always has plists, but a font with no
// outlines at all has no glif worth sampling.
export const detectUfoTextStyle = (samples: {
  glif?: string | null
  plist?: string | null
}): UfoTextStyle => {
  const reference = samples.plist || samples.glif
  if (!reference) {
    return UFOLIB_TEXT_STYLE
  }
  return {
    xmlQuote: detectXmlQuote(reference),
    selfClosingSpace: samples.glif
      ? /\s\/>/.test(samples.glif)
      : UFOLIB_TEXT_STYLE.selfClosingSpace,
    plistIndent: samples.plist
      ? detectPlistIndent(samples.plist)
      : UFOLIB_TEXT_STYLE.plistIndent,
    plistIndentRoot: samples.plist
      ? detectPlistIndentRoot(samples.plist)
      : UFOLIB_TEXT_STYLE.plistIndentRoot,
    // Only decidable when the sample actually contains a quote; without one the
    // flag cannot change any output anyway.
    escapeQuotesInText: samples.plist
      ? samples.plist.includes('&quot;')
      : UFOLIB_TEXT_STYLE.escapeQuotesInText,
  }
}

// Per-file variations within one UFO: a font can carry glyphs written by
// different tools, and a blank glyph may or may not have an <outline> element.
export interface GlifFileStyle {
  selfClosingSpace?: boolean | null
  // whether a glyph with nothing to draw still writes <outline></outline>
  emptyOutlineElement?: boolean | null
}

export const detectGlifFileStyle = (text: string): GlifFileStyle => ({
  selfClosingSpace: /\s\/>/.test(text),
  emptyOutlineElement: /<outline\s*>|<outline\s*\/>/.test(text),
})

export const resolveUfoTextStyle = (
  style: Partial<UfoTextStyle> | null | undefined
): UfoTextStyle => ({ ...UFOLIB_TEXT_STYLE, ...(style ?? {}) })

export const xmlDeclaration = (style: UfoTextStyle) =>
  `<?xml version=${style.xmlQuote}1.0${style.xmlQuote} encoding=${style.xmlQuote}UTF-8${style.xmlQuote}?>`

export const closeSelfClosing = (style: UfoTextStyle) =>
  style.selfClosingSpace ? ' />' : '/>'
