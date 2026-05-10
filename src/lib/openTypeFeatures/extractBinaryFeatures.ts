import {
  findSfntTable,
  readSfntTableDirectory,
} from 'src/lib/openTypeFeatures/binaryReader'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import {
  createLookupProvenance,
  parseLayoutTableInventory,
  type LayoutFeatureInventory,
  type LayoutLanguageInventory,
  type LayoutLookupInventory,
  type LayoutTableInventory,
} from 'src/lib/openTypeFeatures/layoutTableInventory'
import { toStableIdPart } from 'src/lib/openTypeFeatures/ids'
import type {
  FeatureDiagnostic,
  FeatureEntry,
  FeatureRecord,
  FontFingerprint,
  GposLookupType,
  GsubLookupType,
  LanguageSystem,
  LookupFlagIR,
  LookupRecord,
  OpenTypeFeaturesState,
  UnsupportedLookup,
} from 'src/lib/openTypeFeatures/types'

const GSUB_LOOKUP_TYPES: Record<number, GsubLookupType> = {
  1: 'singleSubst',
  2: 'multipleSubst',
  3: 'alternateSubst',
  4: 'ligatureSubst',
  5: 'contextSubst',
  6: 'chainingContextSubst',
  7: 'extensionSubst',
  8: 'reverseChainingSingleSubst',
}

const GPOS_LOOKUP_TYPES: Record<number, GposLookupType> = {
  1: 'singlePos',
  2: 'pairPos',
  3: 'cursivePos',
  4: 'markToBasePos',
  5: 'markToLigaturePos',
  6: 'markToMarkPos',
  7: 'contextPos',
  8: 'chainingContextPos',
  9: 'extensionPos',
}

const makeExtractorDiagnostic = (
  severity: FeatureDiagnostic['severity'],
  message: string,
  idPart: string
): FeatureDiagnostic => ({
  id: `feature-diagnostic-${severity}-binary-extractor-${idPart}`,
  severity,
  message,
  target: { kind: 'global' },
})

const toLookupFlagIr = (lookupFlag: number): LookupFlagIR => ({
  rightToLeft: Boolean(lookupFlag & 0x0001) || undefined,
  ignoreBaseGlyphs: Boolean(lookupFlag & 0x0002) || undefined,
  ignoreLigatures: Boolean(lookupFlag & 0x0004) || undefined,
  ignoreMarks: Boolean(lookupFlag & 0x0008) || undefined,
  useMarkFilteringSet: Boolean(lookupFlag & 0x0010) || undefined,
})

const getLookupTypeName = (table: 'GSUB' | 'GPOS', lookupType: number) =>
  table === 'GSUB'
    ? (GSUB_LOOKUP_TYPES[lookupType] ?? 'extensionSubst')
    : (GPOS_LOOKUP_TYPES[lookupType] ?? 'extensionPos')

const makeLookupId = (table: 'GSUB' | 'GPOS', lookupIndex: number) =>
  `lookup_${table.toLowerCase()}_${lookupIndex}`

const makeFeatureId = (
  table: 'GSUB' | 'GPOS',
  feature: LayoutFeatureInventory
) =>
  `feature_${table.toLowerCase()}_${feature.featureIndex}_${toStableIdPart(feature.tag)}`

const makeLanguageSystemId = (script: string, language: string) =>
  `languagesystem_${toStableIdPart(script)}_${toStableIdPart(language)}`

const makeFeatureEntryId = (
  table: 'GSUB' | 'GPOS',
  featureIndex: number,
  language: LayoutLanguageInventory
) =>
  [
    'feature_entry',
    table.toLowerCase(),
    featureIndex,
    toStableIdPart(language.script),
    toStableIdPart(language.language),
  ].join('_')

const toLanguageSystems = (
  inventories: LayoutTableInventory[]
): LanguageSystem[] => {
  const systems = new Map<string, LanguageSystem>()

  systems.set('DFLT:dflt', {
    id: 'languagesystem_DFLT_dflt',
    script: 'DFLT',
    language: 'dflt',
  })

  for (const inventory of inventories) {
    for (const language of inventory.languages) {
      const key = `${language.script}:${language.language}`
      systems.set(key, {
        id: makeLanguageSystemId(language.script, language.language),
        script: language.script,
        language: language.language,
      })
    }
  }

  return Array.from(systems.values())
}

const toFeatureRecords = (
  inventory: LayoutTableInventory,
  diagnostics: FeatureDiagnostic[]
): FeatureRecord[] => {
  const featureByIndex = new Map(
    inventory.features.map((feature) => [feature.featureIndex, feature])
  )

  return inventory.features.map((feature) => {
    const entries: FeatureEntry[] = inventory.languages
      .filter((language) =>
        language.featureIndices.includes(feature.featureIndex)
      )
      .map((language) => ({
        id: makeFeatureEntryId(inventory.table, feature.featureIndex, language),
        script: language.script,
        language: language.language,
        lookupIds: feature.lookupIndices
          .filter((lookupIndex) => {
            const exists = inventory.lookups.some(
              (lookup) => lookup.lookupIndex === lookupIndex
            )
            if (!exists) {
              diagnostics.push(
                makeExtractorDiagnostic(
                  'warning',
                  `${inventory.table} feature ${feature.tag} references missing lookup ${lookupIndex}.`,
                  `${inventory.table}-feature-${feature.featureIndex}-missing-lookup-${lookupIndex}`
                )
              )
            }
            return exists
          })
          .map((lookupIndex) => makeLookupId(inventory.table, lookupIndex)),
      }))

    if (!featureByIndex.has(feature.featureIndex)) {
      diagnostics.push(
        makeExtractorDiagnostic(
          'warning',
          `${inventory.table} feature index ${feature.featureIndex} could not be resolved.`,
          `${inventory.table}-feature-${feature.featureIndex}-unresolved`
        )
      )
    }

    return {
      id: makeFeatureId(inventory.table, feature),
      tag: feature.tag,
      isActive: true,
      entries,
      origin: 'imported',
      meta: {
        table: inventory.table,
        featureIndex: feature.featureIndex,
        importedFromCompiledLayout: true,
      },
    }
  })
}

const toLookupRecord = (
  table: 'GSUB' | 'GPOS',
  lookup: LayoutLookupInventory
): LookupRecord => ({
  id: makeLookupId(table, lookup.lookupIndex),
  name: `${table}_lookup_${lookup.lookupIndex}`,
  table,
  lookupType: getLookupTypeName(table, lookup.lookupType),
  lookupFlag: toLookupFlagIr(lookup.lookupFlag),
  markFilteringSetClassId:
    lookup.markFilteringSet === undefined
      ? undefined
      : `mark_filtering_set_${lookup.markFilteringSet}`,
  rules: [],
  editable: false,
  origin: 'unsupported',
  provenance: createLookupProvenance(table, lookup),
  meta: {
    importedFromCompiledLayout: true,
    lookupTypeNumber: lookup.lookupType,
    lookupFlagNumber: lookup.lookupFlag,
    subtableFormats: lookup.subtableFormats,
  },
  diagnostics: [
    {
      id: `feature-diagnostic-warning-${table}-lookup-${lookup.lookupIndex}-readonly`,
      severity: 'warning',
      message:
        'This compiled lookup was inventoried from the binary font but is not visually editable yet.',
      target: {
        kind: 'lookup',
        lookupId: makeLookupId(table, lookup.lookupIndex),
      },
    },
  ],
})

const toUnsupportedLookup = (
  table: 'GSUB' | 'GPOS',
  lookup: LayoutLookupInventory
): UnsupportedLookup => ({
  id: `unsupported_${table.toLowerCase()}_${lookup.lookupIndex}`,
  table,
  lookupIndex: lookup.lookupIndex,
  lookupType: lookup.lookupType,
  subtableFormats: lookup.subtableFormats,
  reason:
    'Binary OpenType layout lookup reconstruction is not implemented for this lookup yet.',
  rawSummary: `${table} lookup ${lookup.lookupIndex}, type ${lookup.lookupType}, formats ${
    lookup.subtableFormats.length > 0
      ? lookup.subtableFormats.join(', ')
      : 'unknown'
  }`,
  preserveMode: 'preserve-if-unchanged',
  provenance: createLookupProvenance(table, lookup),
})

const mergeFeatureRecords = (records: FeatureRecord[]) => {
  const merged = new Map<string, FeatureRecord>()

  for (const record of records) {
    const existing = merged.get(record.tag)
    if (!existing) {
      merged.set(record.tag, record)
      continue
    }

    existing.entries.push(...record.entries)
    existing.origin =
      existing.origin === record.origin ? existing.origin : 'mixed'
    existing.meta = {
      ...existing.meta,
      mergedCompiledFeatureRecords: [
        ...((existing.meta?.mergedCompiledFeatureRecords as
          | string[]
          | undefined) ?? []),
        record.id,
      ],
    }
  }

  return Array.from(merged.values())
}

export const extractBinaryFeatures = (
  buffer: ArrayBuffer,
  fontFingerprint: FontFingerprint | null
): OpenTypeFeaturesState => {
  const directory = readSfntTableDirectory(buffer)
  const layoutTableRecords = directory.tables.filter(
    (table): table is typeof table & { tag: 'GSUB' | 'GPOS' } =>
      table.tag === 'GSUB' || table.tag === 'GPOS'
  )

  const inventories = layoutTableRecords.map((table) =>
    parseLayoutTableInventory(buffer, table)
  )
  const diagnostics = [
    ...directory.diagnostics,
    ...inventories.flatMap((inventory) => inventory.diagnostics),
  ]

  if (findSfntTable(directory, 'GDEF')) {
    diagnostics.push(
      makeExtractorDiagnostic(
        'info',
        'GDEF table is present. Kumiko records its presence, but detailed GDEF extraction is staged.',
        'gdef-present'
      )
    )
  }

  if (findSfntTable(directory, 'kern')) {
    diagnostics.push(
      makeExtractorDiagnostic(
        'warning',
        'Legacy kern table is present and is distinct from a GPOS kern feature. Kumiko will not convert it automatically.',
        'legacy-kern-present'
      )
    )
  }

  const state = createEmptyOpenTypeFeaturesState(fontFingerprint)
  state.languagesystems = toLanguageSystems(inventories)
  state.features = mergeFeatureRecords(
    inventories.flatMap((inventory) => toFeatureRecords(inventory, diagnostics))
  )
  state.lookups = inventories.flatMap((inventory) =>
    inventory.lookups.map((lookup) => toLookupRecord(inventory.table, lookup))
  )
  state.unsupportedLookups = inventories.flatMap((inventory) =>
    inventory.lookups.map((lookup) =>
      toUnsupportedLookup(inventory.table, lookup)
    )
  )
  state.gdef = findSfntTable(directory, 'GDEF') ? {} : null
  state.diagnostics = diagnostics

  return state
}
