export {
  DEFAULT_AUTO_FEATURE_CONFIG,
  DEFAULT_GLYPH_NAMING_CONVENTION,
  DEFAULT_SUFFIX_FEATURE_MAP,
  OPEN_TYPE_FEATURES_IR_VERSION,
  createEmptyOpenTypeFeaturesState,
  createFontFingerprint,
  ensureOpenTypeFeaturesState,
  getGlyphOrder,
} from 'src/lib/openTypeFeatures/defaults'
export {
  makeFeatureId,
  makeLookupId,
  makeRuleId,
  makeSuggestionId,
  toStableIdPart,
} from 'src/lib/openTypeFeatures/ids'
export { buildFeaDocument } from 'src/lib/openTypeFeatures/buildFeaDocument'
export { buildAutoFeatureSuggestions } from 'src/lib/openTypeFeatures/buildAutoFeatureSuggestions'
export { buildKerningSuggestions } from 'src/lib/openTypeFeatures/buildKerningSuggestions'
export { buildMarkSuggestions } from 'src/lib/openTypeFeatures/buildMarkSuggestions'
export { compileFontWithFeatures } from 'src/lib/openTypeFeatures/compileFontWithFeatures'
export {
  AVAILABLE_OPEN_TYPE_COMPILER_BACKENDS,
  DEFAULT_OPEN_TYPE_COMPILER_BACKEND,
  createCompilerRuntimeStatus,
  makeRuntimeNotConfiguredDiagnostic,
  makeRuntimeNotConfiguredResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
export { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
export { generateFea } from 'src/lib/openTypeFeatures/generateFea'
export {
  hasActiveManagedFeatureText,
  selectUfoFeatureText,
} from 'src/lib/openTypeFeatures/legacyFeatureText'
export { parseLayoutTableInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
export { readSfntTableDirectory } from 'src/lib/openTypeFeatures/binaryReader'
export { serializeFeaDocument } from 'src/lib/openTypeFeatures/serializeFea'
export { validateFeatures } from 'src/lib/openTypeFeatures/validateFeatures'
export {
  applyAutoFeatureSuggestion,
  ignoreAutoFeatureSuggestion,
} from 'src/lib/openTypeFeatures/applySuggestion'
export {
  deriveOpenTypeExportWarnings,
  hasBlockingExportWarnings,
  hasManagedFeatureEdits,
  needsOpenTypeFeatureCompilationForBinaryExport,
} from 'src/lib/openTypeFeatures/exportPolicy'
export type * from 'src/lib/openTypeFeatures/feaAst'
export type * from 'src/lib/openTypeFeatures/compilerTypes'
export type * from 'src/lib/openTypeFeatures/exportPolicy'
export type * from 'src/lib/openTypeFeatures/types'
