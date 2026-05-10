import type { GlyphSelector, ValueRecord } from 'src/lib/openTypeFeatures/types'

export interface FeaDocument {
  kind: 'Document'
  statements: FeaNode[]
}

export type FeaNode =
  | LanguageSystemNode
  | GlyphClassNode
  | MarkClassNode
  | LookupBlockNode
  | FeatureBlockNode
  | ScriptStatementNode
  | LanguageStatementNode
  | SubstitutionNode
  | PositioningNode
  | RawNode
  | CommentNode

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
