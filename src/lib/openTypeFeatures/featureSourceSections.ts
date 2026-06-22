import type {
  ClassifiedFeatureRecordRef,
  FeatureSourceOrigin,
  FeatureSourceSection,
  OpenTypeFeaturesState,
  OpenTypeTableTag,
} from 'src/lib/openTypeFeatures/types'

export const RAW_FEATURE_TEXT_SOURCE_ID = 'source_raw_feature_text'

type RawFeatureTextSourceOrigin = Extract<
  FeatureSourceOrigin,
  'manual-input' | 'ufo-import'
>

const RAW_SOURCE_ORIGIN_TITLE: Record<RawFeatureTextSourceOrigin, string> = {
  'manual-input': 'Handwritten .fea source',
  'ufo-import': 'UFO features.fea',
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
  kind: origin === 'ufo-import' ? 'ufo-fea' : 'manual-fea',
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

export const setRawFeatureTextSource = (
  state: OpenTypeFeaturesState,
  rawFeatureText: string,
  options: RawFeatureTextSourceOptions = {}
): OpenTypeFeaturesState => {
  const normalizedText = rawFeatureText.length > 0 ? rawFeatureText : undefined
  const sourceSectionsWithoutRawText = (state.sourceSections ?? []).filter(
    (section) => section.textRef !== 'rawFeatureText'
  )

  return {
    ...state,
    rawFeatureText: normalizedText,
    sourceSections: normalizedText?.trim()
      ? [
          createRawFeatureTextSourceSection(options),
          ...sourceSectionsWithoutRawText,
        ]
      : sourceSectionsWithoutRawText,
  }
}

interface CompiledTableSourceSectionOptions {
  table: OpenTypeTableTag
  featureIds?: string[]
  lookupIds?: string[]
  glyphClassIds?: string[]
  markClassIds?: string[]
  unsupportedLookupIds?: string[]
  diagnosticIds?: string[]
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
  title,
  meta,
}: CompiledTableSourceSectionOptions): FeatureSourceSection => {
  const lookupCount = lookupIds?.length ?? 0
  const unsupportedCount = unsupportedLookupIds?.length ?? 0
  const editableLookupCount = Math.max(lookupCount - unsupportedCount, 0)
  const status =
    unsupportedCount === 0
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
    preservationPolicy:
      unsupportedCount > 0 ? 'preserve-if-unchanged' : 'editable-rebuild',
    meta,
  }
}
