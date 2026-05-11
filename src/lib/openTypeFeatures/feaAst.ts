import type {
  GlyphSelector,
  LookupFlagIR,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'

export interface FeaDocument {
  kind: 'Document'
  statements: FeaNode[]
}

export interface LanguageSystemNode {
  kind: 'LanguageSystem'
  script: string
  language: string
}

export interface GlyphClassNode {
  kind: 'GlyphClass'
  name: string
  glyphs: string[]
  classId?: string
}

export interface MarkClassNode {
  kind: 'MarkClass'
  glyph: string
  anchor: { x: number; y: number }
  className: string
}

export interface LookupFlagNode {
  kind: 'LookupFlag'
  flags: LookupFlagIR
  markFilteringSetName?: string
}

export interface LookupBlockNode {
  kind: 'LookupBlock'
  name: string
  lookupId: string
  statements: FeaNode[]
}

export interface FeatureBlockNode {
  kind: 'FeatureBlock'
  tag: string
  featureId: string
  statements: FeaNode[]
}

export interface ScriptStatementNode {
  kind: 'ScriptStatement'
  script: string
}

export interface LanguageStatementNode {
  kind: 'LanguageStatement'
  language: string
}

export interface SubstitutionNode {
  kind: 'Substitution'
  ruleId?: string
  pattern: GlyphSelector[]
  replacement: string[]
  alternates?: string[]
}

export interface PositioningNode {
  kind: 'Positioning'
  ruleId?: string
  left: GlyphSelector
  right?: GlyphSelector
  firstValue?: ValueRecord
  secondValue?: ValueRecord
}

export interface ContextualSubstitutionNode {
  kind: 'ContextualSubstitution'
  ruleId?: string
  backtrack: GlyphSelector[]
  input: Array<{
    selector: GlyphSelector
    lookupNames: string[]
  }>
  lookahead: GlyphSelector[]
}

export interface MarkAttachment {
  markClassName: string
  anchor: { x: number; y: number }
}

export interface MarkToBaseNode {
  kind: 'MarkToBase'
  ruleId?: string
  base: GlyphSelector
  marks: MarkAttachment[]
}

export interface MarkToMarkNode {
  kind: 'MarkToMark'
  ruleId?: string
  baseMark: GlyphSelector
  marks: MarkAttachment[]
}

export interface MarkToLigatureNode {
  kind: 'MarkToLigature'
  ruleId?: string
  ligature: GlyphSelector
  componentMarks: MarkAttachment[][]
}

export type FeaNode =
  | LanguageSystemNode
  | GlyphClassNode
  | MarkClassNode
  | LookupFlagNode
  | LookupBlockNode
  | FeatureBlockNode
  | ScriptStatementNode
  | LanguageStatementNode
  | SubstitutionNode
  | ContextualSubstitutionNode
  | PositioningNode
  | MarkToBaseNode
  | MarkToMarkNode
  | MarkToLigatureNode
  | RawNode
  | CommentNode

export interface RawNode {
  kind: 'Raw'
  value: string
}

export interface CommentNode {
  kind: 'Comment'
  value: string
}

export interface GeneratedFeaSourceMap {
  entries: FeaSourceMapEntry[]
}

export interface FeaSourceMapEntry {
  ruleId?: string
  featureId?: string
  lookupId?: string
  lineStart: number
  lineEnd: number
}
