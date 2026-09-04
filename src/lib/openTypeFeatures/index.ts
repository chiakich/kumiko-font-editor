export {
  DEFAULT_AUTO_FEATURE_CONFIG,
  DEFAULT_GLYPH_NAMING_CONVENTION,
  DEFAULT_SUFFIX_FEATURE_MAP,
  OPEN_TYPE_FEATURES_IR_VERSION,
  createEmptyOpenTypeFeaturesState,
  createFontFingerprint,
  ensureOpenTypeFeaturesState,
  getGlyphOrder,
} from '@/lib/openTypeFeatures/defaults'
export {
  makeFeatureId,
  makeLookupId,
  makeRuleId,
  makeSuggestionId,
  toStableIdPart,
} from '@/lib/openTypeFeatures/ids'
export { mergeFeatureDiagnostics } from '@/lib/openTypeFeatures/diagnostics'
export { buildFeaDocument } from '@/lib/openTypeFeatures/buildFeaDocument'
export { buildAutoFeatureSuggestions } from '@/lib/openTypeFeatures/buildAutoFeatureSuggestions'
export { buildKerningSuggestions } from '@/lib/openTypeFeatures/buildKerningSuggestions'
export { buildMarkSuggestions } from '@/lib/openTypeFeatures/buildMarkSuggestions'
export {
  compileFontWithFeatures,
  prewarmOpenTypeFeatureCompiler,
} from '@/lib/openTypeFeatures/compileFontWithFeatures'
export { compileManagedFontFeatures } from '@/lib/openTypeFeatures/compileManagedFontFeatures'
export {
  AVAILABLE_OPEN_TYPE_COMPILER_BACKENDS,
  DEFAULT_OPEN_TYPE_COMPILER_BACKEND,
  createCompilerRuntimeStatus,
  makeCompilerErrorResponse,
  makeRuntimeNotConfiguredDiagnostic,
  makeRuntimeNotConfiguredResponse,
} from '@/lib/openTypeFeatures/compilerRuntimePlan'
export {
  findFeaSourceMapEntryForLine,
  mapCompilerErrorsToDiagnostics,
  mapFeaLineToDiagnosticTarget,
  parseCompilerErrorLocations,
  type CompilerErrorLocation,
} from '@/lib/openTypeFeatures/compilerErrorMapping'
export {
  canInstalledDependenciesCompileGeneratedFeaOffline,
  getInstalledCompilerDependencyCapabilities,
  getOpenTypeCompilerRuntimeRequirement,
} from '@/lib/openTypeFeatures/compilerRuntimeCapabilities'
export {
  createHarfBuzzRuntimeStatus,
  getHarfBuzzRuntimeCapabilities,
} from '@/lib/openTypeFeatures/harfbuzzRuntimeCapabilities'
export { extractBinaryFeatures } from '@/lib/openTypeFeatures/extractBinaryFeatures'
export { generateFea } from '@/lib/openTypeFeatures/generateFea'
export { resolveHarfBuzzWasmLocation } from '@/lib/openTypeFeatures/harfbuzzWasmLocation'
export {
  hasExportableFeatureText,
  selectUfoFeatureText,
} from '@/lib/openTypeFeatures/ufoFeatureText'
export {
  RAW_FEATURE_TEXT_SOURCE_ID,
  createCompiledTableSourceSection,
  createRawFeatureTextSourceSection,
  setRawFeatureSnippetsSource,
  setRawFeatureTextSource,
} from '@/lib/openTypeFeatures/featureSourceSections'
export { classifyRawFeatureTextSource } from '@/lib/openTypeFeatures/classifyRawFeatureText'
export {
  getRawFeatureText,
  hasRawFeatureText,
  joinRawFeatureSnippets,
  normalizeRawFeatureSnippets,
  splitRawFeatureTextIntoSnippets,
} from '@/lib/openTypeFeatures/rawFeatureSnippets'
export { parseLayoutTableInventory } from '@/lib/openTypeFeatures/layoutTableInventory'
export { parseGdefTable } from '@/lib/openTypeFeatures/gdefParser'
export { readSfntTableDirectory } from '@/lib/openTypeFeatures/binaryReader'
export { serializeFeaDocument } from '@/lib/openTypeFeatures/serializeFea'
export { shapeTextWithHarfBuzz } from '@/lib/openTypeFeatures/shapeTextWithHarfBuzz'
export {
  traceTextShaping,
  type ShapeTraceResult,
  type ShapingTraceStep,
} from '@/lib/openTypeFeatures/traceShaping'
export { getGlyphCatalog } from '@/lib/openTypeFeatures/harfbuzzGlyphCatalog'
export { validateFeatures } from '@/lib/openTypeFeatures/validateFeatures'
export {
  applyAutoFeatureSuggestion,
  ignoreAutoFeatureSuggestion,
} from '@/lib/openTypeFeatures/applySuggestion'
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
  splitSpacingClassMember,
  upsertAnchorBehavior,
  upsertAlternateBehavior,
  upsertCombinationBehavior,
  upsertContextualBehavior,
  upsertSpacingBehavior,
} from '@/lib/openTypeFeatures/behaviorFacade'
export {
  deriveOpenTypeExportImpactItems,
  deriveOpenTypeExportWarnings,
  hasBlockingExportWarnings,
  hasManagedFeatureEdits,
  needsOpenTypeFeatureCompilationForBinaryExport,
} from '@/lib/openTypeFeatures/exportPolicy'
export { deriveOpenTypeImportExportSummary } from '@/lib/openTypeFeatures/importExportSummary'
export {
  deriveOpenTypeSourceSectionRecords,
  findOpenTypeSourceSectionsForRecord,
} from '@/lib/openTypeFeatures/sourceSectionRecords'
export type * from '@/lib/openTypeFeatures/feaAst'
export type * from '@/lib/openTypeFeatures/harfbuzzTypes'
export type * from '@/lib/openTypeFeatures/compilerTypes'
export type * from '@/lib/openTypeFeatures/exportPolicy'
export type * from '@/lib/openTypeFeatures/importExportSummary'
export type * from '@/lib/openTypeFeatures/sourceSectionRecords'
export type * from '@/lib/openTypeFeatures/behaviorFacade'
export type * from '@/lib/openTypeFeatures/types'
