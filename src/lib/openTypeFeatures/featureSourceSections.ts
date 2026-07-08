import { splitRawFeatureTextIntoSnippets } from 'src/lib/openTypeFeatures/rawFeatureSnippets'
import type {
  ClassifiedFeatureRecordRef,
  FeatureSourceOrigin,
  FeatureSourceSection,
  OpenTypeFeaturesState,
  OpenTypeTableTag,
  RawFeatureSnippet,
} from 'src/lib/openTypeFeatures/types'

export const RAW_FEATURE_TEXT_SOURCE_ID = 'source_raw_feature_text'

type RawFeatureTextSourceOrigin = Extract<
  FeatureSourceOrigin,
  'manual-input' | 'ufo-import' | 'glyphs-import'
>

const RAW_SOURCE_ORIGIN_TITLE: Record<RawFeatureTextSourceOrigin, string> = {
  'manual-input': 'Handwritten .fea source',
  'ufo-import': 'UFO features.fea',
  'glyphs-import': 'Glyphs features and prefixes',
}

const RAW_SOURCE_ORIGIN_KIND: Record<
  RawFeatureTextSourceOrigin,
  FeatureSourceSection['kind']
> = {
  'manual-input': 'manual-fea',
  'ufo-import': 'ufo-fea',
  'glyphs-import': 'glyphs-fea',
}

interface RawFeatureTextSourceOptions {
  origin?: RawFeatureTextSourceOrigin
  path?: string
  title?: string
}

export const createRawFeatureTextSourceSection = ({
  origin = 'manual-input',
  path,
  title,
}: RawFeatureTextSourceOptions = {}): FeatureSourceSection => ({
  id: RAW_FEATURE_TEXT_SOURCE_ID,
  title: title ?? RAW_SOURCE_ORIGIN_TITLE[origin],
  kind: RAW_SOURCE_ORIGIN_KIND[origin],
  origin,
  format: 'fea',
  stage: 'source',
  status: 'raw',
  path,
  textRef: 'rawFeatureText',
  recordRefs: [],
  preservationPolicy: 'editable-rebuild',
  meta: {
    canParseIntoRecords: true,
  },
})

export const setRawFeatureSnippetsSource = (
  state: OpenTypeFeaturesState,
  snippets: RawFeatureSnippet[],
  options: RawFeatureTextSourceOptions = {}
): OpenTypeFeaturesState => {
  const sourceSectionsWithoutRawText = (state.sourceSections ?? []).filter(
    (section) => section.textRef !== 'rawFeatureText'
  )
  return {
    ...state,
    rawFeatureText: undefined,
    rawFeatureSnippets: snippets.length > 0 ? snippets : undefined,
    sourceSections:
      snippets.length > 0
        ? [
            createRawFeatureTextSourceSection(options),
            ...sourceSectionsWithoutRawText,
          ]
        : sourceSectionsWithoutRawText,
  }
}

export const setRawFeatureTextSource = (
  state: OpenTypeFeaturesState,
  rawFeatureText: string,
  options: RawFeatureTextSourceOptions = {}
): OpenTypeFeaturesState => {
  // Re-splitting fresh text produces new snippet objects; carry over
  // per-snippet flags and metadata from existing snippets with the same id
  // so a whole-text edit does not silently drop them.
  const previousById = new Map(
    (state.rawFeatureSnippets ?? []).map((snippet) => [snippet.id, snippet])
  )
  const snippets = splitRawFeatureTextIntoSnippets(rawFeatureText).map(
    (snippet) => {
      const previous = previousById.get(snippet.id)
      if (!previous) return snippet
      return {
        ...snippet,
        ...(previous.name !== undefined ? { name: previous.name } : {}),
        ...(previous.disabled !== undefined
          ? { disabled: previous.disabled }
          : {}),
        ...(previous.meta !== undefined ? { meta: previous.meta } : {}),
      }
    }
  )
  return setRawFeatureSnippetsSource(state, snippets, options)
}

interface CompiledTableSourceSectionOptions {
  table: OpenTypeTableTag
  featureIds?: string[]
  lookupIds?: string[]
  glyphClassIds?: string[]
  markClassIds?: string[]
  unsupportedLookupIds?: string[]
  diagnosticIds?: string[]
  unreconstructedTableData?: string[]
  title?: string
  meta?: Record<string, unknown>
}

const refsFor = (
  kind: ClassifiedFeatureRecordRef['kind'],
  ids: string[] | undefined,
  table: OpenTypeTableTag
): ClassifiedFeatureRecordRef[] =>
  (ids ?? []).map((id) => ({
    kind,
    id,
    table,
  }))

const uniqueRefs = (
  refs: ClassifiedFeatureRecordRef[]
): ClassifiedFeatureRecordRef[] => {
  const seen = new Set<string>()
  const result: ClassifiedFeatureRecordRef[] = []

  for (const ref of refs) {
    const key = `${ref.kind}:${ref.table ?? ''}:${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ref)
  }

  return result
}

export const createCompiledTableSourceSection = ({
  table,
  featureIds,
  lookupIds,
  glyphClassIds,
  markClassIds,
  unsupportedLookupIds,
  diagnosticIds,
  unreconstructedTableData = [],
  title,
  meta,
}: CompiledTableSourceSectionOptions): FeatureSourceSection => {
  const lookupCount = lookupIds?.length ?? 0
  const unsupportedCount = unsupportedLookupIds?.length ?? 0
  const editableLookupCount = Math.max(lookupCount - unsupportedCount, 0)
  const hasPreservedCompiledData =
    unsupportedCount > 0 || unreconstructedTableData.length > 0
  const status = !hasPreservedCompiledData
    ? 'classified'
    : editableLookupCount > 0
      ? 'partially-classified'
      : 'inventoried'

  return {
    id: `source_compiled_${table.toLowerCase()}`,
    title: title ?? `${table} compiled table`,
    kind: 'compiled-table',
    origin: 'binary-import',
    format: 'opentype-layout-table',
    stage: 'classified',
    status,
    table,
    recordRefs: uniqueRefs([
      ...refsFor('feature', featureIds, table),
      ...refsFor('lookup', lookupIds, table),
      ...refsFor('glyphClass', glyphClassIds, table),
      ...refsFor('markClass', markClassIds, table),
      ...refsFor('unsupportedLookup', unsupportedLookupIds, table),
      ...refsFor('diagnostic', diagnosticIds, table),
      ...(table === 'GDEF'
        ? [{ kind: 'gdef' as const, id: 'gdef', table }]
        : []),
    ]),
    preservationPolicy: hasPreservedCompiledData
      ? 'preserve-if-unchanged'
      : 'editable-rebuild',
    meta: {
      ...meta,
      ...(unreconstructedTableData.length > 0
        ? { unreconstructedTableData }
        : {}),
    },
  }
}
