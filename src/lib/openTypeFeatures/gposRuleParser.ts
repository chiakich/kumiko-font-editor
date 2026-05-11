import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import type { LayoutLookupInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
import type {
  FeatureDiagnostic,
  PairPositioningRule,
  Rule,
  SinglePositioningRule,
  SourceProvenance,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'

export interface GposRuleParseResult {
  rules: Rule[]
  diagnostics: FeatureDiagnostic[]
  unsupportedReason?: string
}

interface ParsedValueRecord {
  value: ValueRecord
  byteLength: number
}

const VALUE_FORMAT_FIELDS: Array<keyof ValueRecord> = [
  'xPlacement',
  'yPlacement',
  'xAdvance',
  'yAdvance',
]

const makeParserDiagnostic = (
  severity: FeatureDiagnostic['severity'],
  message: string,
  idPart: string,
  lookupId: string
): FeatureDiagnostic => ({
  id: `feature-diagnostic-${severity}-gpos-parser-${idPart}`,
  severity,
  message,
  target: { kind: 'lookup', lookupId },
})

const toSignedInt16 = (value: number) =>
  value > 0x7fff ? value - 0x10000 : value

const glyphNameForId = (glyphOrder: string[], glyphId: number) =>
  glyphOrder[glyphId] ?? null

const makeRuleId = (
  lookupIndex: number,
  subtableIndex: number,
  kind: string,
  ruleIndex: number
) => `rule_gpos_${lookupIndex}_${subtableIndex}_${kind}_${ruleIndex}`

const makeProvenance = (
  lookup: LayoutLookupInventory,
  subtableIndex: number
): SourceProvenance => ({
  table: 'GPOS',
  lookupIndex: lookup.lookupIndex,
  lookupType: lookup.lookupType,
  subtableIndex,
  subtableFormat: lookup.subtableFormats[subtableIndex],
})

const readCoverageGlyphIds = (
  subtableReader: BinaryReader,
  coverageOffset: number
) => {
  const coverageReader = subtableReader.at(coverageOffset)
  const coverageFormat = coverageReader?.uint16(0)
  if (
    !coverageReader ||
    coverageFormat === null ||
    coverageFormat === undefined
  ) {
    return null
  }

  if (coverageFormat === 1) {
    const glyphCount = coverageReader.uint16(2)
    if (glyphCount === null) return null

    const glyphIds: number[] = []
    for (let index = 0; index < glyphCount; index += 1) {
      const glyphId = coverageReader.uint16(4 + index * 2)
      if (glyphId === null) return null
      glyphIds.push(glyphId)
    }
    return glyphIds
  }

  if (coverageFormat === 2) {
    const rangeCount = coverageReader.uint16(2)
    if (rangeCount === null) return null

    const glyphIds: number[] = []
    for (let index = 0; index < rangeCount; index += 1) {
      const rangeOffset = 4 + index * 6
      const startGlyphId = coverageReader.uint16(rangeOffset)
      const endGlyphId = coverageReader.uint16(rangeOffset + 2)
      if (startGlyphId === null || endGlyphId === null) return null

      for (let glyphId = startGlyphId; glyphId <= endGlyphId; glyphId += 1) {
        glyphIds.push(glyphId)
      }
    }
    return glyphIds
  }

  return null
}

const resolveGlyphNames = (
  glyphOrder: string[],
  glyphIds: number[]
): string[] | null => {
  const glyphNames = glyphIds.map((glyphId) =>
    glyphNameForId(glyphOrder, glyphId)
  )
  return glyphNames.every(
    (glyphName): glyphName is string => glyphName !== null
  )
    ? glyphNames
    : null
}

const readValueRecord = (
  reader: BinaryReader,
  offset: number,
  valueFormat: number
): ParsedValueRecord | null => {
  const value: ValueRecord = {}
  let cursor = offset

  for (let bitIndex = 0; bitIndex < VALUE_FORMAT_FIELDS.length; bitIndex += 1) {
    if (!(valueFormat & (1 << bitIndex))) continue

    const rawValue = reader.uint16(cursor)
    if (rawValue === null) return null

    value[VALUE_FORMAT_FIELDS[bitIndex]] = toSignedInt16(rawValue)
    cursor += 2
  }

  if (valueFormat & 0xfff0) {
    return null
  }

  return {
    value,
    byteLength: cursor - offset,
  }
}

const isEmptyValue = (value: ValueRecord) =>
  value.xPlacement === undefined &&
  value.yPlacement === undefined &&
  value.xAdvance === undefined &&
  value.yAdvance === undefined

const parseSinglePositioning = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): SinglePositioningRule[] | null => {
  const format = subtableReader.uint16(0)
  const coverageOffset = subtableReader.uint16(2)
  const valueFormat = subtableReader.uint16(4)
  if (format === null || coverageOffset === null || valueFormat === null) {
    return null
  }

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageGlyphNames = coverageGlyphIds
    ? resolveGlyphNames(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageGlyphNames) return null

  if (format === 1) {
    const valueRecord = readValueRecord(subtableReader, 6, valueFormat)
    if (!valueRecord || isEmptyValue(valueRecord.value)) return null

    return coverageGlyphNames.map((glyphName, index) => ({
      id: makeRuleId(lookup.lookupIndex, subtableIndex, 'single', index),
      kind: 'singlePositioning',
      target: { kind: 'glyph', glyph: glyphName },
      value: valueRecord.value,
      meta: {
        origin: 'imported',
        provenance: makeProvenance(lookup, subtableIndex),
      },
    }))
  }

  if (format === 2) {
    const valueCount = subtableReader.uint16(6)
    if (valueCount === null || valueCount !== coverageGlyphNames.length) {
      return null
    }

    const rules: SinglePositioningRule[] = []
    let valueOffset = 8
    for (let index = 0; index < valueCount; index += 1) {
      const valueRecord = readValueRecord(
        subtableReader,
        valueOffset,
        valueFormat
      )
      if (!valueRecord || isEmptyValue(valueRecord.value)) return null

      rules.push({
        id: makeRuleId(lookup.lookupIndex, subtableIndex, 'single', index),
        kind: 'singlePositioning',
        target: { kind: 'glyph', glyph: coverageGlyphNames[index] },
        value: valueRecord.value,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
      valueOffset += valueRecord.byteLength
    }
    return rules
  }

  return null
}

const parsePairPositioningFormat1 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): PairPositioningRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const valueFormat1 = subtableReader.uint16(4)
  const valueFormat2 = subtableReader.uint16(6)
  const pairSetCount = subtableReader.uint16(8)
  if (
    coverageOffset === null ||
    valueFormat1 === null ||
    valueFormat2 === null ||
    pairSetCount === null
  ) {
    return null
  }

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageGlyphNames = coverageGlyphIds
    ? resolveGlyphNames(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageGlyphNames || coverageGlyphNames.length !== pairSetCount) {
    return null
  }

  const rules: PairPositioningRule[] = []
  for (let setIndex = 0; setIndex < pairSetCount; setIndex += 1) {
    const pairSetOffset = subtableReader.uint16(10 + setIndex * 2)
    const pairSetReader =
      pairSetOffset === null ? null : subtableReader.at(pairSetOffset)
    const pairValueCount = pairSetReader?.uint16(0)
    if (
      !pairSetReader ||
      pairValueCount === null ||
      pairValueCount === undefined
    ) {
      return null
    }

    let pairValueOffset = 2
    for (let pairIndex = 0; pairIndex < pairValueCount; pairIndex += 1) {
      const secondGlyphId = pairSetReader.uint16(pairValueOffset)
      const secondGlyph =
        secondGlyphId === null
          ? null
          : glyphNameForId(glyphOrder, secondGlyphId)
      if (!secondGlyph) return null

      const firstValue = readValueRecord(
        pairSetReader,
        pairValueOffset + 2,
        valueFormat1
      )
      if (!firstValue) return null

      const secondValue = readValueRecord(
        pairSetReader,
        pairValueOffset + 2 + firstValue.byteLength,
        valueFormat2
      )
      if (!secondValue) return null

      if (isEmptyValue(firstValue.value) && isEmptyValue(secondValue.value)) {
        return null
      }

      rules.push({
        id: makeRuleId(lookup.lookupIndex, subtableIndex, 'pair', rules.length),
        kind: 'pairPositioning',
        left: { kind: 'glyph', glyph: coverageGlyphNames[setIndex] },
        right: { kind: 'glyph', glyph: secondGlyph },
        firstValue: isEmptyValue(firstValue.value)
          ? undefined
          : firstValue.value,
        secondValue: isEmptyValue(secondValue.value)
          ? undefined
          : secondValue.value,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })

      pairValueOffset += 2 + firstValue.byteLength + secondValue.byteLength
    }
  }

  return rules
}

const parseSupportedSubtable = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
) => {
  const format = subtableReader.uint16(0)
  if (format !== lookup.subtableFormats[subtableIndex]) return null

  if (lookup.lookupType === 1) {
    return parseSinglePositioning(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  if (lookup.lookupType === 2 && format === 1) {
    return parsePairPositioningFormat1(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  return null
}

export const parseGposLookupRules = (
  buffer: ArrayBuffer,
  tableOffset: number,
  lookup: LayoutLookupInventory,
  glyphOrder: string[],
  lookupId: string
): GposRuleParseResult => {
  if (![1, 2].includes(lookup.lookupType)) {
    return {
      rules: [],
      diagnostics: [],
      unsupportedReason: `GPOS lookup type ${lookup.lookupType} is not reconstructed into editable rules yet.`,
    }
  }

  const tableReader = new BinaryReader(buffer).at(tableOffset)
  if (!tableReader) {
    return {
      rules: [],
      diagnostics: [
        makeParserDiagnostic(
          'warning',
          'GPOS table could not be read for rule reconstruction.',
          `lookup-${lookup.lookupIndex}-table-unreadable`,
          lookupId
        ),
      ],
      unsupportedReason: 'GPOS table could not be read.',
    }
  }

  const rules: Rule[] = []
  const diagnostics: FeatureDiagnostic[] = []

  for (
    let subtableIndex = 0;
    subtableIndex < lookup.subtableOffsets.length;
    subtableIndex += 1
  ) {
    const subtableReader = tableReader.at(lookup.subtableOffsets[subtableIndex])
    const parsedRules = subtableReader
      ? parseSupportedSubtable(
          subtableReader,
          glyphOrder,
          lookup,
          subtableIndex
        )
      : null

    if (!parsedRules) {
      diagnostics.push(
        makeParserDiagnostic(
          'warning',
          `GPOS lookup ${lookup.lookupIndex} subtable ${subtableIndex} could not be reconstructed as editable rules.`,
          `lookup-${lookup.lookupIndex}-subtable-${subtableIndex}-unsupported`,
          lookupId
        )
      )
      return {
        rules,
        diagnostics,
        unsupportedReason:
          'One or more GPOS subtables could not be reconstructed as editable rules.',
      }
    }

    rules.push(...parsedRules)
  }

  return { rules, diagnostics }
}
