import {
  BinaryReader,
  type SfntTableRecord,
} from 'src/lib/openTypeFeatures/binaryReader'
import type {
  FeatureDiagnostic,
  OpenTypeTableTag,
  SourceProvenance,
} from 'src/lib/openTypeFeatures/types'

export interface LayoutLanguageInventory {
  script: string
  language: string
  featureIndices: number[]
}

export interface LayoutFeatureInventory {
  tag: string
  featureIndex: number
  lookupIndices: number[]
}

export interface LayoutLookupInventory {
  lookupIndex: number
  lookupType: number
  lookupFlag: number
  subtableFormats: number[]
  markFilteringSet?: number
}

export interface LayoutTableInventory {
  table: 'GSUB' | 'GPOS'
  languages: LayoutLanguageInventory[]
  features: LayoutFeatureInventory[]
  lookups: LayoutLookupInventory[]
  diagnostics: FeatureDiagnostic[]
}

const makeInventoryDiagnostic = (
  severity: FeatureDiagnostic['severity'],
  message: string,
  table: OpenTypeTableTag,
  idPart: string
): FeatureDiagnostic => ({
  id: `feature-diagnostic-${severity}-${table}-${idPart}`,
  severity,
  message,
  target: { kind: 'global' },
})

const readOffsetList = (
  reader: BinaryReader,
  countOffset: number,
  listOffset: number
) => {
  const count = reader.uint16(countOffset)
  if (count === null) return null

  const offsets: number[] = []
  for (let index = 0; index < count; index += 1) {
    const offset = reader.uint16(listOffset + index * 2)
    if (offset === null) return null
    offsets.push(offset)
  }
  return offsets
}

const parseScriptList = (
  tableReader: BinaryReader,
  scriptListOffset: number,
  table: 'GSUB' | 'GPOS',
  diagnostics: FeatureDiagnostic[]
): LayoutLanguageInventory[] => {
  const scriptListReader = tableReader.at(scriptListOffset)
  const scriptCount = scriptListReader?.uint16(0)
  if (!scriptListReader || scriptCount == null) {
    diagnostics.push(
      makeInventoryDiagnostic(
        'warning',
        `${table} ScriptList is malformed.`,
        table,
        'script-list-malformed'
      )
    )
    return []
  }

  const languages: LayoutLanguageInventory[] = []
  for (let scriptIndex = 0; scriptIndex < scriptCount; scriptIndex += 1) {
    const recordOffset = 2 + scriptIndex * 6
    const script = scriptListReader.tag(recordOffset)
    const scriptOffset = scriptListReader.uint16(recordOffset + 4)
    const scriptReader =
      script && scriptOffset !== null ? scriptListReader.at(scriptOffset) : null

    if (!script || !scriptReader) {
      diagnostics.push(
        makeInventoryDiagnostic(
          'warning',
          `${table} script record ${scriptIndex} is malformed.`,
          table,
          `script-${scriptIndex}-malformed`
        )
      )
      continue
    }

    const defaultLangSysOffset = scriptReader.uint16(0)
    if (defaultLangSysOffset && defaultLangSysOffset > 0) {
      const defaultLangSys = parseLangSysFeatureIndices(
        scriptReader,
        defaultLangSysOffset
      )
      if (defaultLangSys) {
        languages.push({
          script,
          language: 'dflt',
          featureIndices: defaultLangSys,
        })
      }
    }

    const langSysCount = scriptReader.uint16(2)
    if (langSysCount === null) {
      diagnostics.push(
        makeInventoryDiagnostic(
          'warning',
          `${table} script ${script} has a malformed LangSys list.`,
          table,
          `script-${script.trim()}-langsys-list-malformed`
        )
      )
      continue
    }

    for (let langIndex = 0; langIndex < langSysCount; langIndex += 1) {
      const langRecordOffset = 4 + langIndex * 6
      const language = scriptReader.tag(langRecordOffset)
      const langSysOffset = scriptReader.uint16(langRecordOffset + 4)
      if (!language || langSysOffset === null) {
        diagnostics.push(
          makeInventoryDiagnostic(
            'warning',
            `${table} LangSys record ${script}/${langIndex} is malformed.`,
            table,
            `script-${script.trim()}-langsys-${langIndex}-malformed`
          )
        )
        continue
      }

      const featureIndices = parseLangSysFeatureIndices(
        scriptReader,
        langSysOffset
      )
      if (featureIndices) {
        languages.push({ script, language, featureIndices })
      }
    }
  }

  return languages
}

const parseLangSysFeatureIndices = (
  scriptReader: BinaryReader,
  langSysOffset: number
) => {
  const langSysReader = scriptReader.at(langSysOffset)
  const featureIndexCount = langSysReader?.uint16(4)
  if (!langSysReader || featureIndexCount == null) return null

  const featureIndices: number[] = []
  for (let index = 0; index < featureIndexCount; index += 1) {
    const featureIndex = langSysReader.uint16(6 + index * 2)
    if (featureIndex === null) return null
    featureIndices.push(featureIndex)
  }
  return featureIndices
}

const parseFeatureList = (
  tableReader: BinaryReader,
  featureListOffset: number,
  table: 'GSUB' | 'GPOS',
  diagnostics: FeatureDiagnostic[]
): LayoutFeatureInventory[] => {
  const featureListReader = tableReader.at(featureListOffset)
  const featureCount = featureListReader?.uint16(0)
  if (!featureListReader || featureCount == null) {
    diagnostics.push(
      makeInventoryDiagnostic(
        'warning',
        `${table} FeatureList is malformed.`,
        table,
        'feature-list-malformed'
      )
    )
    return []
  }

  const features: LayoutFeatureInventory[] = []
  for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
    const recordOffset = 2 + featureIndex * 6
    const tag = featureListReader.tag(recordOffset)
    const featureOffset = featureListReader.uint16(recordOffset + 4)
    const featureReader =
      tag && featureOffset !== null ? featureListReader.at(featureOffset) : null

    if (!tag || !featureReader) {
      diagnostics.push(
        makeInventoryDiagnostic(
          'warning',
          `${table} feature record ${featureIndex} is malformed.`,
          table,
          `feature-${featureIndex}-malformed`
        )
      )
      continue
    }

    const lookupIndices = readOffsetList(featureReader, 2, 4)
    if (!lookupIndices) {
      diagnostics.push(
        makeInventoryDiagnostic(
          'warning',
          `${table} feature ${tag} has a malformed lookup index list.`,
          table,
          `feature-${featureIndex}-lookup-list-malformed`
        )
      )
      continue
    }

    features.push({ tag, featureIndex, lookupIndices })
  }

  return features
}

const parseLookupList = (
  tableReader: BinaryReader,
  lookupListOffset: number,
  table: 'GSUB' | 'GPOS',
  diagnostics: FeatureDiagnostic[]
): LayoutLookupInventory[] => {
  const lookupListReader = tableReader.at(lookupListOffset)
  const lookupOffsets = lookupListReader
    ? readOffsetList(lookupListReader, 0, 2)
    : null
  if (!lookupListReader || !lookupOffsets) {
    diagnostics.push(
      makeInventoryDiagnostic(
        'warning',
        `${table} LookupList is malformed.`,
        table,
        'lookup-list-malformed'
      )
    )
    return []
  }

  return lookupOffsets.flatMap((lookupOffset, lookupIndex) => {
    const lookupReader = lookupListReader.at(lookupOffset)
    const lookupType = lookupReader?.uint16(0)
    const lookupFlag = lookupReader?.uint16(2)
    const subtableCount = lookupReader?.uint16(4)
    if (
      !lookupReader ||
      lookupType === null ||
      lookupType === undefined ||
      lookupFlag === null ||
      lookupFlag === undefined ||
      subtableCount === null ||
      subtableCount === undefined
    ) {
      diagnostics.push(
        makeInventoryDiagnostic(
          'warning',
          `${table} lookup ${lookupIndex} is malformed.`,
          table,
          `lookup-${lookupIndex}-malformed`
        )
      )
      return []
    }

    const subtableFormats: number[] = []
    for (
      let subtableIndex = 0;
      subtableIndex < subtableCount;
      subtableIndex += 1
    ) {
      const subtableOffset = lookupReader.uint16(6 + subtableIndex * 2)
      const subtableReader =
        subtableOffset !== null ? lookupReader.at(subtableOffset) : null
      const subtableFormat = subtableReader?.uint16(0)
      if (subtableFormat === null || subtableFormat === undefined) {
        diagnostics.push(
          makeInventoryDiagnostic(
            'warning',
            `${table} lookup ${lookupIndex} subtable ${subtableIndex} is malformed.`,
            table,
            `lookup-${lookupIndex}-subtable-${subtableIndex}-malformed`
          )
        )
        continue
      }
      subtableFormats.push(subtableFormat)
    }

    const markFilteringSet =
      lookupFlag & 0x0010
        ? (lookupReader.uint16(6 + subtableCount * 2) ?? undefined)
        : undefined

    return [
      {
        lookupIndex,
        lookupType,
        lookupFlag,
        subtableFormats,
        markFilteringSet,
      },
    ]
  })
}

export const parseLayoutTableInventory = (
  buffer: ArrayBuffer,
  tableRecord: SfntTableRecord & { tag: 'GSUB' | 'GPOS' }
): LayoutTableInventory => {
  const table = tableRecord.tag
  const reader = new BinaryReader(buffer).at(tableRecord.offset)
  const diagnostics: FeatureDiagnostic[] = []

  if (!reader) {
    return {
      table,
      languages: [],
      features: [],
      lookups: [],
      diagnostics: [
        makeInventoryDiagnostic(
          'warning',
          `${table} table could not be read.`,
          table,
          'table-unreadable'
        ),
      ],
    }
  }

  const scriptListOffset = reader.uint16(4)
  const featureListOffset = reader.uint16(6)
  const lookupListOffset = reader.uint16(8)
  if (
    scriptListOffset === null ||
    featureListOffset === null ||
    lookupListOffset === null
  ) {
    diagnostics.push(
      makeInventoryDiagnostic(
        'warning',
        `${table} header is malformed; no layout inventory was imported.`,
        table,
        'header-malformed'
      )
    )
    return { table, languages: [], features: [], lookups: [], diagnostics }
  }

  return {
    table,
    languages: parseScriptList(reader, scriptListOffset, table, diagnostics),
    features: parseFeatureList(reader, featureListOffset, table, diagnostics),
    lookups: parseLookupList(reader, lookupListOffset, table, diagnostics),
    diagnostics,
  }
}

export const createLookupProvenance = (
  table: 'GSUB' | 'GPOS',
  lookup: LayoutLookupInventory,
  subtableIndex = 0
): SourceProvenance => ({
  table,
  lookupIndex: lookup.lookupIndex,
  lookupType: lookup.lookupType,
  subtableIndex,
  subtableFormat: lookup.subtableFormats[subtableIndex],
})
