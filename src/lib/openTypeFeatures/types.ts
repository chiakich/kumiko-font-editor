export type OpenTypeTableTag = 'GSUB' | 'GPOS' | 'GDEF'

export type FeatureOrigin =
  | 'manual'
  | 'auto'
  | 'imported'
  | 'synthetic'
  | 'mixed'

export type LookupOrigin =
  | 'manual'
  | 'auto'
  | 'imported'
  | 'unsupported'
  | 'generated'

export type ExportPolicy =
  | 'rebuild-managed-layout-tables'
  | 'preserve-compiled-layout-tables'
  | 'drop-unsupported-and-rebuild'

export interface FontFingerprint {
  glyphOrderHash: string
  cmapHash: string
  unitsPerEm: number
  glyphCount: number
}

export interface LanguageSystem {
  id: string
  script: string
  language: string
}

export interface FeatureRecord {
  id: string
  tag: string
  label?: string
  isActive: boolean
  entries: FeatureEntry[]
  origin: FeatureOrigin
  meta?: Record<string, unknown>
}

export interface FeatureEntry {
  id: string
  script: string
  language: string
  lookupIds: string[]
}

export type GsubLookupType =
  | 'singleSubst'
  | 'multipleSubst'
  | 'alternateSubst'
  | 'ligatureSubst'
  | 'contextSubst'
  | 'chainingContextSubst'
  | 'extensionSubst'
  | 'reverseChainingSingleSubst'

export type GposLookupType =
  | 'singlePos'
  | 'pairPos'
  | 'cursivePos'
  | 'markToBasePos'
  | 'markToLigaturePos'
  | 'markToMarkPos'
  | 'contextPos'
  | 'chainingContextPos'
  | 'extensionPos'

export interface LookupFlagIR {
  rightToLeft?: boolean
  ignoreBaseGlyphs?: boolean
  ignoreLigatures?: boolean
  ignoreMarks?: boolean
  useMarkFilteringSet?: boolean
}

export interface LookupRecord {
  id: string
  name: string
  table: 'GSUB' | 'GPOS'
  lookupType: GsubLookupType | GposLookupType
  lookupFlag: LookupFlagIR
  markFilteringSetClassId?: string
  rules: Rule[]
  editable: boolean
  origin: LookupOrigin
  meta?: Record<string, unknown>
  provenance?: SourceProvenance
  diagnostics?: FeatureDiagnostic[]
}

export type GlyphSelector =
  | { kind: 'glyph'; glyph: string }
  | { kind: 'class'; classId: string }

export interface RuleMeta {
  origin: FeatureOrigin
  generator?: AutoFeatureGeneratorName
  confidence?: 'high' | 'medium' | 'low'
  userOverridden?: boolean
  locked?: boolean
  dirty?: boolean
  reason?: string
  provenance?: SourceProvenance
}

export interface SingleSubstitutionRule {
  id: string
  kind: 'singleSubstitution'
  target: GlyphSelector
  replacement: string
  meta: RuleMeta
}

export interface MultipleSubstitutionRule {
  id: string
  kind: 'multipleSubstitution'
  target: string
  replacement: string[]
  meta: RuleMeta
}

export interface AlternateSubstitutionRule {
  id: string
  kind: 'alternateSubstitution'
  target: string
  alternates: string[]
  meta: RuleMeta
}

export interface LigatureSubstitutionRule {
  id: string
  kind: 'ligatureSubstitution'
  components: string[]
  replacement: string
  meta: RuleMeta
}

export interface ValueRecord {
  xPlacement?: number
  yPlacement?: number
  xAdvance?: number
  yAdvance?: number
}

export interface PairPositioningRule {
  id: string
  kind: 'pairPositioning'
  left: GlyphSelector
  right: GlyphSelector
  firstValue?: ValueRecord
  secondValue?: ValueRecord
  meta: RuleMeta
}

export interface SinglePositioningRule {
  id: string
  kind: 'singlePositioning'
  target: GlyphSelector
  value: ValueRecord
  meta: RuleMeta
}

export interface ContextInput {
  selector: GlyphSelector
  lookupIds?: string[]
}

export interface ContextualRule {
  id: string
  kind: 'contextualSubstitution' | 'contextualPositioning'
  mode: 'context' | 'chaining'
  backtrack: GlyphSelector[]
  input: ContextInput[]
  lookahead: GlyphSelector[]
  meta: RuleMeta
}

export interface AnchorPoint {
  x: number
  y: number
}

export interface MarkToBaseRule {
  id: string
  kind: 'markToBase'
  baseGlyphs: GlyphSelector
  anchors: Record<string, AnchorPoint>
  meta: RuleMeta
}

export interface MarkToMarkRule {
  id: string
  kind: 'markToMark'
  baseMarks: GlyphSelector
  anchors: Record<string, AnchorPoint>
  meta: RuleMeta
}

export interface MarkToLigatureRule {
  id: string
  kind: 'markToLigature'
  ligatures: GlyphSelector
  componentAnchors: Array<Record<string, AnchorPoint>>
  meta: RuleMeta
}

export interface CursivePositioningRule {
  id: string
  kind: 'cursivePositioning'
  glyphs: GlyphSelector
  entryAnchor?: AnchorPoint
  exitAnchor?: AnchorPoint
  meta: RuleMeta
}

export type Rule =
  | SingleSubstitutionRule
  | MultipleSubstitutionRule
  | AlternateSubstitutionRule
  | LigatureSubstitutionRule
  | PairPositioningRule
  | SinglePositioningRule
  | ContextualRule
  | MarkToBaseRule
  | MarkToMarkRule
  | MarkToLigatureRule
  | CursivePositioningRule

export type AutoFeatureGeneratorName =
  | 'glyph-name-ligature'
  | 'glyph-suffix'
  | 'localized-glyph'
  | 'small-caps'
  | 'numerals'
  | 'kerning-groups'
  | 'anchors'

export interface GlyphClass {
  id: string
  name: string
  glyphs: string[]
  origin: FeatureOrigin
  meta?: {
    userOverridden?: boolean
    generatedBy?: AutoFeatureGeneratorName
  }
}

export interface MarkClass {
  id: string
  name: string
  marks: MarkClassMember[]
}

export interface MarkClassMember {
  glyph: string
  anchor: AnchorPoint
}

export interface AnchorDefinition {
  id: string
  glyph: string
  name: string
  x: number
  y: number
}

export interface GdefState {
  glyphClasses?: {
    base?: string[]
    ligature?: string[]
    mark?: string[]
    component?: string[]
  }
  markGlyphSets?: GlyphClass[]
  ligatureCarets?: LigatureCaret[]
}

export interface LigatureCaret {
  glyph: string
  carets: number[]
}

export interface SourceProvenance {
  table: OpenTypeTableTag
  script?: string
  language?: string
  featureTag?: string
  featureIndex?: number
  lookupIndex?: number
  subtableIndex?: number
  lookupType?: number
  subtableFormat?: number
}

export interface UnsupportedLookup {
  id: string
  table: 'GSUB' | 'GPOS'
  lookupIndex: number
  lookupType: number
  subtableFormats: number[]
  reason: string
  rawSummary: string
  preserveMode: 'preserve-if-unchanged' | 'drop-on-rebuild'
  provenance: SourceProvenance
}

export interface FeatureDiagnostic {
  id: string
  severity: 'info' | 'warning' | 'error'
  message: string
  target:
    | { kind: 'feature'; featureId: string }
    | { kind: 'lookup'; lookupId: string }
    | { kind: 'rule'; ruleId: string }
    | { kind: 'class'; classId: string }
    | { kind: 'global' }
}

export interface AutoFeatureSuggestion {
  id: string
  featureTag: string
  lookup: LookupRecord
  glyphClasses?: GlyphClass[]
  markClasses?: MarkClass[]
  ruleIds: string[]
  confidence: 'high' | 'medium' | 'low'
  reason: string
  status: 'pending' | 'accepted' | 'ignored'
}

export interface AutoFeatureConfig {
  enabled: boolean
  liga: boolean
  dlig: boolean
  rlig: boolean
  hlig: boolean
  locl: boolean
  salt: boolean
  stylisticSets: boolean
  smcp: boolean
  c2sc: boolean
  onum: boolean
  lnum: boolean
  pnum: boolean
  tnum: boolean
  sups: boolean
  subs: boolean
  ordn: boolean
  frac: boolean
  kern: boolean
  mark: boolean
  mkmk: boolean
}

export interface GlyphNamingConvention {
  ligatureSeparator: '_'
  suffixFeatureMap: Record<string, string>
  localizedSuffixPattern: 'loclXXX' | 'languageTagOnly' | 'custom'
  customLocalizedRegex?: string
}

export interface OpenTypeFeaturesState {
  irVersion: string
  fontFingerprint: FontFingerprint | null
  languagesystems: LanguageSystem[]
  features: FeatureRecord[]
  lookups: LookupRecord[]
  glyphClasses: GlyphClass[]
  markClasses: MarkClass[]
  anchors: AnchorDefinition[]
  gdef: GdefState | null
  unsupportedLookups: UnsupportedLookup[]
  autoFeatureConfig: AutoFeatureConfig
  ignoredSuggestionIds: string[]
  exportPolicy: ExportPolicy
  rawPrelude?: string
  diagnostics?: FeatureDiagnostic[]
}
