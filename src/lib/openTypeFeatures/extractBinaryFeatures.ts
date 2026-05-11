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
import {
  parseGsubLookupRules,
  type GsubRuleParseResult,
} from 'src/lib/openTypeFeatures/gsubRuleParser'
import {
  parseGposLookupRules,
  type GposRuleParseResult,
} from 'src/lib/openTypeFeatures/gposRuleParser'
import { parseGdefTable } from 'src/lib/openTypeFeatures/gdefParser'
import { toStableIdPart } from 'src/lib/openTypeFeatures/ids'
import type {
  FeatureDiagnostic,
  FeatureEntry,
  FeatureRecord,
  FontFingerprint,
  GlyphClass,
  GposLookupType,
  GsubLookupType,
  LanguageSystem,
  LookupFlagIR,
  LookupRecord,
  MarkClass,
  OpenTypeFeaturesState,
  UnsupportedLookup,
} from 'src/lib/openTypeFeatures/types'

interface ParsedLookupState {
  lookup: LayoutLookupInventory
  parseResult: GsubRuleParseResult | GposRuleParseResult | null
}

const getParsedGlyphClasses = (
  parseResult: GsubRuleParseResult | GposRuleParseResult | null
): GlyphClass[] =>
  parseResult && 'glyphClasses' in parseResult
    ? (parseResult.glyphClasses ?? [])
    : []

const getParsedMarkClasses = (
  parseResult: GsubRuleParseResult | GposRuleParseResult | null
): MarkClass[] =>
  parseResult && 'markClasses' in parseResult
    ? (parseResult.markClasses ?? [])
    : []

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
  parsedLookup: ParsedLookupState
): LookupRecord => {
  const { lookup, parseResult } = parsedLookup
  const lookupId = makeLookupId(table, lookup.lookupIndex)
  const isEditable = Boolean(parseResult && !parseResult.unsupportedReason)
  const readonlyDiagnostic: FeatureDiagnostic = {
    id: `feature-diagnostic-warning-${table}-lookup-${lookup.lookupIndex}-readonly`,
    severity: 'warning',
    message:
      'This compiled lookup was inventoried from the binary font but is not visually editable yet.',
    target: {
      kind: 'lookup',
      lookupId,
    },
  }

  return {
    id: lookupId,
    name: `${table}_lookup_${lookup.lookupIndex}`,
    table,
    lookupType: getLookupTypeName(table, lookup.lookupType),
    lookupFlag: toLookupFlagIr(lookup.lookupFlag),
    markFilteringSetClassId:
      lookup.markFilteringSet === undefined
        ? undefined
        : `mark_filtering_set_${lookup.markFilteringSet}`,
    rules: isEditable && parseResult ? parseResult.rules : [],
    editable: isEditable,
    origin: isEditable ? 'imported' : 'unsupported',
    provenance: createLookupProvenance(table, lookup),
    meta: {
      importedFromCompiledLayout: true,
      lookupTypeNumber: lookup.lookupType,
      lookupFlagNumber: lookup.lookupFlag,
      subtableFormats: lookup.subtableFormats,
      reconstructedEditableRules: isEditable,
    },
    diagnostics: isEditable
      ? (parseResult?.diagnostics ?? [])
      : [readonlyDiagnostic, ...(parseResult?.diagnostics ?? [])],
  }
}

const toUnsupportedLookup = (
  table: 'GSUB' | 'GPOS',
  parsedLookup: ParsedLookupState
): UnsupportedLookup => ({
  id: `unsupported_${table.toLowerCase()}_${parsedLookup.lookup.lookupIndex}`,
  table,
  lookupIndex: parsedLookup.lookup.lookupIndex,
  lookupType: parsedLookup.lookup.lookupType,
  subtableFormats: parsedLookup.lookup.subtableFormats,
  reason:
    parsedLookup.parseResult?.unsupportedReason ??
    'Binary OpenType layout lookup reconstruction is not implemented for this lookup yet.',
  rawSummary: `${table} lookup ${parsedLookup.lookup.lookupIndex}, type ${parsedLookup.lookup.lookupType}, formats ${
    parsedLookup.lookup.subtableFormats.length > 0
      ? parsedLookup.lookup.subtableFormats.join(', ')
      : 'unknown'
  }`,
  preserveMode: 'preserve-if-unchanged',
  provenance: createLookupProvenance(table, parsedLookup.lookup),
})

const parseInventoryLookups = (
  buffer: ArrayBuffer,
  inventory: LayoutTableInventory,
  glyphOrder: string[]
): ParsedLookupState[] =>
  inventory.lookups.map((lookup) => {
    const lookupId = makeLookupId(inventory.table, lookup.lookupIndex)
    const parseResult =
      inventory.table === 'GSUB'
        ? parseGsubLookupRules(
            buffer,
            inventory.tableOffset,
            lookup,
            glyphOrder,
            lookupId
          )
        : parseGposLookupRules(
            buffer,
            inventory.tableOffset,
            lookup,
            glyphOrder,
            lookupId
          )

    return { lookup, parseResult }
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
  fontFingerprint: FontFingerprint | null,
  glyphOrder: string[] = []
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
  diagnostics.push(
    ...inventories
      .filter((inventory) => inventory.featureVariationsOffset !== undefined)
      .map((inventory) =>
        makeExtractorDiagnostic(
          'warning',
          `${inventory.table} FeatureVariations table is present. Kumiko preserves this as explicit unsupported compiled layout data; feature variation reconstruction is not implemented yet.`,
          `${inventory.table.toLowerCase()}-feature-variations-present`
        )
      )
  )
  const parsedLookupEntries = inventories.map((inventory) => ({
    inventory,
    lookups: parseInventoryLookups(buffer, inventory, glyphOrder),
  }))
  diagnostics.push(
    ...parsedLookupEntries.flatMap((entry) =>
      entry.lookups.flatMap((lookup) => lookup.parseResult?.diagnostics ?? [])
    )
  )

  const gdefRecord = findSfntTable(directory, 'GDEF')
  const parsedGdef = gdefRecord
    ? parseGdefTable(buffer, gdefRecord.offset, glyphOrder)
    : null
  if (parsedGdef) diagnostics.push(...parsedGdef.diagnostics)

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
  state.lookups = parsedLookupEntries.flatMap((entry) =>
    entry.lookups.map((lookup) => toLookupRecord(entry.inventory.table, lookup))
  )
  state.glyphClasses = parsedLookupEntries.flatMap((entry) =>
    entry.lookups.flatMap((lookup) => getParsedGlyphClasses(lookup.parseResult))
  )
  state.markClasses = parsedLookupEntries.flatMap((entry) =>
    entry.lookups.flatMap((lookup) => getParsedMarkClasses(lookup.parseResult))
  )
  state.unsupportedLookups = parsedLookupEntries.flatMap((entry) =>
    entry.lookups
      .filter(
        (lookup) =>
          lookup.parseResult === null ||
          Boolean(lookup.parseResult.unsupportedReason)
      )
      .map((lookup) => toUnsupportedLookup(entry.inventory.table, lookup))
  )
  state.gdef = parsedGdef?.gdef ?? null
  state.diagnostics = diagnostics

  return state
}
