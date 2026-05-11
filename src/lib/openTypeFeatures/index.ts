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
export { compileManagedFontFeatures } from 'src/lib/openTypeFeatures/compileManagedFontFeatures'
export {
  AVAILABLE_OPEN_TYPE_COMPILER_BACKENDS,
  DEFAULT_OPEN_TYPE_COMPILER_BACKEND,
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
  makeRuntimeNotConfiguredDiagnostic,
  makeRuntimeNotConfiguredResponse,
} from 'src/lib/openTypeFeatures/compilerRuntimePlan'
export {
  findFeaSourceMapEntryForLine,
  mapCompilerErrorsToDiagnostics,
  mapFeaLineToDiagnosticTarget,
  parseCompilerErrorLocations,
} from 'src/lib/openTypeFeatures/compilerErrorMapping'
export {
  canInstalledDependenciesCompileGeneratedFeaOffline,
  getInstalledCompilerDependencyCapabilities,
  getOpenTypeCompilerRuntimeRequirement,
} from 'src/lib/openTypeFeatures/compilerRuntimeCapabilities'
export {
  createHarfBuzzRuntimeStatus,
  getHarfBuzzRuntimeCapabilities,
} from 'src/lib/openTypeFeatures/harfbuzzRuntimeCapabilities'
export { extractBinaryFeatures } from 'src/lib/openTypeFeatures/extractBinaryFeatures'
export { generateFea } from 'src/lib/openTypeFeatures/generateFea'
export { loadHarfBuzzRuntime } from 'src/lib/openTypeFeatures/harfbuzzRuntime'
export { resolveHarfBuzzWasmLocation } from 'src/lib/openTypeFeatures/harfbuzzWasmLocation'
export {
  hasActiveManagedFeatureText,
  selectUfoFeatureText,
} from 'src/lib/openTypeFeatures/legacyFeatureText'
export { parseLayoutTableInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
export { parseGdefTable } from 'src/lib/openTypeFeatures/gdefParser'
export { readSfntTableDirectory } from 'src/lib/openTypeFeatures/binaryReader'
export { serializeFeaDocument } from 'src/lib/openTypeFeatures/serializeFea'
export { shapeTextWithHarfBuzz } from 'src/lib/openTypeFeatures/shapeTextWithHarfBuzz'
export { validateFeatures } from 'src/lib/openTypeFeatures/validateFeatures'
export {
  applyAutoFeatureSuggestion,
  ignoreAutoFeatureSuggestion,
} from 'src/lib/openTypeFeatures/applySuggestion'
export {
  ALTERNATE_BEHAVIOR_TYPE_LABELS,
  ALTERNATE_BEHAVIOR_TYPES,
  COMBINATION_BEHAVIOR_TYPE_LABELS,
  COMBINATION_BEHAVIOR_TYPES,
  canCommitAnchorBehavior,
  canCommitAlternateBehavior,
  canCommitCombinationBehavior,
  canCommitContextualBehavior,
  canCommitSpacingBehavior,
  deleteAnchorBehavior,
  deleteAlternateBehavior,
  deleteCombinationBehavior,
  deleteContextualBehavior,
  deleteSpacingBehavior,
  deriveGlyphAnchorBehaviors,
  deriveGlyphAlternateBehaviors,
  deriveGlyphCombinationBehaviors,
  deriveGlyphContextualBehaviors,
  deriveGlyphSpacingBehaviors,
  isGlyphReferencedByOpenTypeBehaviors,
  makeCompositeGlyphFromComponents,
  makeEditableGlyphCopy,
  parseCombinationInput,
  resolveAlternateFeatureTag,
  resolveCombinationFeatureTag,
  suggestAlternateGlyphName,
  suggestCombinationOutput,
  upsertAnchorBehavior,
  upsertAlternateBehavior,
  upsertCombinationBehavior,
  upsertContextualBehavior,
  upsertSpacingBehavior,
} from 'src/lib/openTypeFeatures/behaviorFacade'
export {
  deriveOpenTypeExportWarnings,
  hasBlockingExportWarnings,
  hasManagedFeatureEdits,
  needsOpenTypeFeatureCompilationForBinaryExport,
} from 'src/lib/openTypeFeatures/exportPolicy'
export type * from 'src/lib/openTypeFeatures/feaAst'
export type * from 'src/lib/openTypeFeatures/harfbuzzTypes'
export type * from 'src/lib/openTypeFeatures/compilerTypes'
export type * from 'src/lib/openTypeFeatures/exportPolicy'
export type * from 'src/lib/openTypeFeatures/behaviorFacade'
export type * from 'src/lib/openTypeFeatures/types'
