import type {
  ClassifiedFeatureRecordRef,
  FeatureDiagnostic,
  FeatureSourceSection,
  OpenTypeFeaturesState,
  OpenTypeTableTag,
} from 'src/lib/openTypeFeatures/types'

export interface SourceSectionRecordSummary {
  ref: ClassifiedFeatureRecordRef
  kind: ClassifiedFeatureRecordRef['kind']
  id: string
  table?: OpenTypeTableTag
  label: string
  detail: string
  status: 'resolved' | 'missing'
  severity?: FeatureDiagnostic['severity']
}

export interface SourceSectionRecordGroup {
  section: FeatureSourceSection
  records: SourceSectionRecordSummary[]
  resolvedCount: number
  missingCount: number
}

export const deriveOpenTypeSourceSectionRecords = (
  state: OpenTypeFeaturesState
): SourceSectionRecordGroup[] =>
  (state.sourceSections ?? []).map((section) => {
    const records = section.recordRefs.map((ref) =>
      resolveSourceSectionRecord(state, ref)
    )

    return {
      section,
      records,
      resolvedCount: records.filter((record) => record.status === 'resolved')
        .length,
      missingCount: records.filter((record) => record.status === 'missing')
        .length,
    }
  })

function resolveSourceSectionRecord(
  state: OpenTypeFeaturesState,
  ref: ClassifiedFeatureRecordRef
): SourceSectionRecordSummary {
  switch (ref.kind) {
    case 'languageSystem': {
      const languageSystem = state.languagesystems.find(
        (candidate) => candidate.id === ref.id
      )
      return languageSystem
        ? resolvedRecord(ref, {
            label: `${languageSystem.script} ${languageSystem.language}`,
            detail: 'language system',
          })
        : missingRecord(ref)
    }
    case 'feature': {
      const feature = state.features.find(
        (candidate) => candidate.id === ref.id
      )
      if (!feature) return missingRecord(ref)

      const lookupCount = new Set(
        feature.entries.flatMap((entry) => entry.lookupIds)
      ).size
      return resolvedRecord(ref, {
        label: feature.tag,
        detail: `${feature.entries.length} entries, ${lookupCount} lookups`,
      })
    }
    case 'lookup': {
      const lookup = state.lookups.find(
        (candidate) =>
          candidate.id === ref.id &&
          (!ref.table || candidate.table === ref.table)
      )
      if (!lookup) return missingRecord(ref)

      return resolvedRecord(ref, {
        label: lookup.name,
        detail: `${lookup.table} ${lookup.lookupType}, ${lookup.rules.length} rules`,
      })
    }
    case 'glyphClass': {
      const glyphClass = state.glyphClasses.find(
        (candidate) => candidate.id === ref.id
      )
      return glyphClass
        ? resolvedRecord(ref, {
            label: glyphClass.name,
            detail: `${glyphClass.glyphs.length} glyphs`,
          })
        : missingRecord(ref)
    }
    case 'markClass': {
      const markClass = state.markClasses.find(
        (candidate) => candidate.id === ref.id
      )
      return markClass
        ? resolvedRecord(ref, {
            label: markClass.name,
            detail: `${markClass.marks.length} marks`,
          })
        : missingRecord(ref)
    }
    case 'gdef':
      return state.gdef
        ? resolvedRecord(ref, {
            label: 'GDEF',
            detail: describeGdefRecord(state),
          })
        : missingRecord(ref)
    case 'unsupportedLookup': {
      const unsupportedLookup = state.unsupportedLookups.find(
        (candidate) =>
          candidate.id === ref.id &&
          (!ref.table || candidate.table === ref.table)
      )
      if (!unsupportedLookup) return missingRecord(ref)

      const formats =
        unsupportedLookup.subtableFormats.length > 0
          ? unsupportedLookup.subtableFormats.join(', ')
          : 'unknown'
      return resolvedRecord(ref, {
        label: `lookup ${unsupportedLookup.lookupIndex}`,
        detail: `${unsupportedLookup.table} type ${unsupportedLookup.lookupType}, formats ${formats}`,
      })
    }
    case 'diagnostic': {
      const diagnostic = state.diagnostics?.find(
        (candidate) => candidate.id === ref.id
      )
      return diagnostic
        ? resolvedRecord(ref, {
            label: `${diagnostic.severity} diagnostic`,
            detail: diagnostic.message,
            severity: diagnostic.severity,
          })
        : missingRecord(ref)
    }
  }
}

function describeGdefRecord(state: OpenTypeFeaturesState) {
  const glyphClassGroupCount = Object.values(
    state.gdef?.glyphClasses ?? {}
  ).filter(Boolean).length
  const markGlyphSetCount = state.gdef?.markGlyphSets?.length ?? 0
  const ligatureCaretCount = state.gdef?.ligatureCarets?.length ?? 0
  const parts = [
    glyphClassGroupCount > 0
      ? `${glyphClassGroupCount} glyph class groups`
      : null,
    markGlyphSetCount > 0 ? `${markGlyphSetCount} mark glyph sets` : null,
    ligatureCaretCount > 0 ? `${ligatureCaretCount} ligature carets` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'GDEF table'
}

function resolvedRecord(
  ref: ClassifiedFeatureRecordRef,
  summary: Pick<SourceSectionRecordSummary, 'label' | 'detail' | 'severity'>
): SourceSectionRecordSummary {
  return {
    ref,
    kind: ref.kind,
    id: ref.id,
    table: ref.table,
    status: 'resolved',
    ...summary,
  }
}

function missingRecord(
  ref: ClassifiedFeatureRecordRef
): SourceSectionRecordSummary {
  return {
    ref,
    kind: ref.kind,
    id: ref.id,
    table: ref.table,
    label: ref.id,
    detail: 'Referenced record is missing from the current feature model.',
    status: 'missing',
  }
}
