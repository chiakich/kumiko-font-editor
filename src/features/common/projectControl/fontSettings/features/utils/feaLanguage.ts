import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'

// AFDKO feature-file keywords the tokenizer colors as such. Statement keywords
// and block keywords share one bucket; FEA has no ambiguity that needs more.
const FEA_KEYWORDS = new Set([
  'anchor',
  'anchorDef',
  'anonymous',
  'anon',
  'by',
  'contour',
  'cursive',
  'device',
  'enum',
  'enumerate',
  'exclude_dflt',
  'feature',
  'featureNames',
  'from',
  'ignore',
  'include',
  'include_dflt',
  'language',
  'languagesystem',
  'lookup',
  'lookupflag',
  'mark',
  'markClass',
  'nameid',
  'name',
  'parameters',
  'pos',
  'position',
  'required',
  'reversesub',
  'rsub',
  'script',
  'sizemenuname',
  'sub',
  'substitute',
  'subtable',
  'table',
  'useExtension',
  'valueRecordDef',
  'cvParameters',
  'FeatUILabelNameID',
  'FeatUITooltipTextNameID',
  'SampleTextNameID',
  'ParamUILabelNameID',
  'Character',
])

const FEA_FLAGS = new Set([
  'RightToLeft',
  'IgnoreBaseGlyphs',
  'IgnoreLigatures',
  'IgnoreMarks',
  'MarkAttachmentType',
  'UseMarkFilteringSet',
])

// A hand-rolled stream tokenizer: FEA is line-oriented enough that a full
// grammar buys nothing over this for highlighting.
export const feaLanguage = StreamLanguage.define<{ inComment: boolean }>({
  name: 'fea',
  startState: () => ({ inComment: false }),
  token: (stream) => {
    if (stream.match(/^#.*/)) {
      return 'comment'
    }
    if (stream.match(/^"([^"\\]|\\.)*"?/)) {
      return 'string'
    }
    if (stream.match(/^@[A-Za-z0-9_.]+/)) {
      return 'className'
    }
    if (stream.match(/^<[^>]*>?/)) {
      return 'number'
    }
    if (stream.match(/^-?\d+(\.\d+)?/)) {
      return 'number'
    }
    const word = stream.match(
      /^[A-Za-z_][A-Za-z0-9_.]*/
    ) as RegExpMatchArray | null
    if (word) {
      if (FEA_KEYWORDS.has(word[0])) {
        return 'keyword'
      }
      if (FEA_FLAGS.has(word[0])) {
        return 'atom'
      }
      return null
    }
    if (stream.match(/^[{}[\];,'\\]/)) {
      return 'punctuation'
    }
    stream.next()
    return null
  },
  languageData: {
    commentTokens: { line: '#' },
  },
})

// Palette tuned to read on both the light and dark app themes: hues carry the
// meaning, the surrounding chrome supplies the contrast.
const feaHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--kumiko-fea-keyword, #7c3aed)' },
  { tag: tags.atom, color: 'var(--kumiko-fea-flag, #0e7490)' },
  { tag: tags.className, color: 'var(--kumiko-fea-class, #b45309)' },
  { tag: tags.number, color: 'var(--kumiko-fea-number, #15803d)' },
  { tag: tags.string, color: 'var(--kumiko-fea-string, #b91c1c)' },
  {
    tag: tags.comment,
    color: 'var(--kumiko-fea-comment, #6b7280)',
    fontStyle: 'italic',
  },
])

export const feaSyntaxHighlighting = syntaxHighlighting(feaHighlightStyle)
