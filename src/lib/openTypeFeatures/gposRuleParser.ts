import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import {
  glyphNameForId,
  makeImportedGlyphClass,
  readAnchorPoint,
  readClassDefGlyphIds,
  readCoverageGlyphNames,
  resolveGlyphNames,
  toSignedInt16,
} from 'src/lib/openTypeFeatures/gposBinaryStructures'
import type { LayoutLookupInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
import type {
  ContextInput,
  CursivePositioningRule,
  FeatureDiagnostic,
  GlyphClass,
  GlyphSelector,
  MarkClass,
  MarkToBaseRule,
  MarkToLigatureRule,
  MarkToMarkRule,
  PairPositioningRule,
  Rule,
  SinglePositioningRule,
  SourceProvenance,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'

export interface GposRuleParseResult {
  rules: Rule[]
  diagnostics: FeatureDiagnostic[]
  glyphClasses?: GlyphClass[]
  markClasses?: MarkClass[]
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

const makeRuleId = (
  lookupIndex: number,
  subtableIndex: number,
  kind: string,
  ruleIndex: number
) => `rule_gpos_${lookupIndex}_${subtableIndex}_${kind}_${ruleIndex}`

const makeClassId = (
  lookupIndex: number,
  subtableIndex: number,
  kind: string,
  classId: number
) => `class_gpos_${lookupIndex}_${subtableIndex}_${kind}_${classId}`

const makeMarkClassId = (
  lookupIndex: number,
  subtableIndex: number,
  classId: number
) => `mark_class_gpos_${lookupIndex}_${subtableIndex}_${classId}`

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
  (value.xPlacement === undefined || value.xPlacement === 0) &&
  (value.yPlacement === undefined || value.yPlacement === 0) &&
  (value.xAdvance === undefined || value.xAdvance === 0) &&
  (value.yAdvance === undefined || value.yAdvance === 0)

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

  const coverageGlyphNames = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    coverageOffset
  )
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

  const coverageGlyphNames = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    coverageOffset
  )
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

const getClassGlyphNames = (
  classGlyphIds: Map<number, number[]>,
  glyphOrder: string[],
  classId: number
) => {
  const glyphIds = classGlyphIds.get(classId)
  return glyphIds ? resolveGlyphNames(glyphOrder, glyphIds) : null
}

const makePairClass = (
  lookup: LayoutLookupInventory,
  subtableIndex: number,
  side: 'left' | 'right',
  classId: number,
  glyphs: string[]
) =>
  makeImportedGlyphClass(
    makeClassId(lookup.lookupIndex, subtableIndex, side, classId),
    `@GPOS_${lookup.lookupIndex}_${subtableIndex}_${side}_${classId}`,
    glyphs
  )

interface ParsedSubtableResult {
  rules: Rule[]
  glyphClasses?: GlyphClass[]
  markClasses?: MarkClass[]
}

const parsePairPositioningFormat2 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedSubtableResult | null => {
  const valueFormat1 = subtableReader.uint16(4)
  const valueFormat2 = subtableReader.uint16(6)
  const classDef1Offset = subtableReader.uint16(8)
  const classDef2Offset = subtableReader.uint16(10)
  const class1Count = subtableReader.uint16(12)
  const class2Count = subtableReader.uint16(14)
  if (
    valueFormat1 === null ||
    valueFormat2 === null ||
    classDef1Offset === null ||
    classDef2Offset === null ||
    class1Count === null ||
    class2Count === null
  ) {
    return null
  }

  const classDef1 = readClassDefGlyphIds(subtableReader, classDef1Offset)
  const classDef2 = readClassDefGlyphIds(subtableReader, classDef2Offset)
  if (!classDef1 || !classDef2) return null

  const classes = new Map<string, GlyphClass>()
  const getClassSelector = (
    side: 'left' | 'right',
    classDef: Map<number, number[]>,
    classId: number
  ) => {
    const glyphs = getClassGlyphNames(classDef, glyphOrder, classId)
    if (!glyphs?.length) return null

    const glyphClass = makePairClass(
      lookup,
      subtableIndex,
      side,
      classId,
      glyphs
    )
    classes.set(glyphClass.id, glyphClass)
    return { kind: 'class' as const, classId: glyphClass.id }
  }

  const rules: PairPositioningRule[] = []
  let recordOffset = 16
  for (let class1Id = 0; class1Id < class1Count; class1Id += 1) {
    for (let class2Id = 0; class2Id < class2Count; class2Id += 1) {
      const firstValue = readValueRecord(
        subtableReader,
        recordOffset,
        valueFormat1
      )
      if (!firstValue) return null

      const secondValue = readValueRecord(
        subtableReader,
        recordOffset + firstValue.byteLength,
        valueFormat2
      )
      if (!secondValue) return null

      if (!isEmptyValue(firstValue.value) || !isEmptyValue(secondValue.value)) {
        const left = getClassSelector('left', classDef1, class1Id)
        const right = getClassSelector('right', classDef2, class2Id)
        if (!left || !right) return null

        rules.push({
          id: makeRuleId(
            lookup.lookupIndex,
            subtableIndex,
            'pairClass',
            rules.length
          ),
          kind: 'pairPositioning',
          left,
          right,
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
      }

      recordOffset += firstValue.byteLength + secondValue.byteLength
    }
  }

  return {
    rules,
    glyphClasses: Array.from(classes.values()),
  }
}

const parseCursivePositioning = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): CursivePositioningRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const entryExitCount = subtableReader.uint16(4)
  if (coverageOffset === null || entryExitCount === null) return null

  const glyphNames = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    coverageOffset
  )
  if (!glyphNames || glyphNames.length !== entryExitCount) return null

  const rules: CursivePositioningRule[] = []
  for (let index = 0; index < entryExitCount; index += 1) {
    const recordOffset = 6 + index * 4
    const entryAnchorOffset = subtableReader.uint16(recordOffset)
    const exitAnchorOffset = subtableReader.uint16(recordOffset + 2)
    if (entryAnchorOffset === null || exitAnchorOffset === null) return null

    const entryAnchor = readAnchorPoint(subtableReader, entryAnchorOffset)
    const exitAnchor = readAnchorPoint(subtableReader, exitAnchorOffset)
    if (!entryAnchor && !exitAnchor) continue

    rules.push({
      id: makeRuleId(
        lookup.lookupIndex,
        subtableIndex,
        'cursive',
        rules.length
      ),
      kind: 'cursivePositioning',
      glyphs: { kind: 'glyph', glyph: glyphNames[index] },
      entryAnchor: entryAnchor ?? undefined,
      exitAnchor: exitAnchor ?? undefined,
      meta: {
        origin: 'imported',
        provenance: makeProvenance(lookup, subtableIndex),
      },
    })
  }

  return rules
}

const parseMarkArray = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  markCoverageOffset: number,
  markArrayOffset: number,
  lookup: LayoutLookupInventory,
  subtableIndex: number
): MarkClass[] | null => {
  const markGlyphs = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    markCoverageOffset
  )
  const markArrayReader = subtableReader.at(markArrayOffset)
  const markCount = markArrayReader?.uint16(0)
  if (!markGlyphs || !markArrayReader || markCount === null) return null
  if (markGlyphs.length !== markCount) return null

  const markClassMap = new Map<number, MarkClass>()
  for (let markIndex = 0; markIndex < markCount; markIndex += 1) {
    const recordOffset = 2 + markIndex * 4
    const classId = markArrayReader.uint16(recordOffset)
    const anchorOffset = markArrayReader.uint16(recordOffset + 2)
    if (classId === null || anchorOffset === null) return null

    const anchor = readAnchorPoint(markArrayReader, anchorOffset)
    if (!anchor) return null

    const markClassId = makeMarkClassId(
      lookup.lookupIndex,
      subtableIndex,
      classId
    )
    const markClass = markClassMap.get(classId) ?? {
      id: markClassId,
      name: `@MC_GPOS_${lookup.lookupIndex}_${subtableIndex}_${classId}`,
      marks: [],
    }
    markClass.marks.push({ glyph: markGlyphs[markIndex], anchor })
    markClassMap.set(classId, markClass)
  }

  return Array.from(markClassMap.values())
}

const parseMarkToBasePositioning = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedSubtableResult | null => {
  const markCoverageOffset = subtableReader.uint16(2)
  const baseCoverageOffset = subtableReader.uint16(4)
  const markClassCount = subtableReader.uint16(6)
  const markArrayOffset = subtableReader.uint16(8)
  const baseArrayOffset = subtableReader.uint16(10)
  if (
    markCoverageOffset === null ||
    baseCoverageOffset === null ||
    markClassCount === null ||
    markArrayOffset === null ||
    baseArrayOffset === null
  ) {
    return null
  }

  const baseGlyphs = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    baseCoverageOffset
  )
  const markClasses = parseMarkArray(
    subtableReader,
    glyphOrder,
    markCoverageOffset,
    markArrayOffset,
    lookup,
    subtableIndex
  )
  const baseArrayReader = subtableReader.at(baseArrayOffset)
  const baseCount = baseArrayReader?.uint16(0)
  if (!baseGlyphs || !markClasses || !baseArrayReader || baseCount === null) {
    return null
  }
  if (baseGlyphs.length !== baseCount) return null

  const rules: MarkToBaseRule[] = []
  for (let baseIndex = 0; baseIndex < baseCount; baseIndex += 1) {
    const anchors: MarkToBaseRule['anchors'] = {}
    for (let classId = 0; classId < markClassCount; classId += 1) {
      const anchorOffset = baseArrayReader.uint16(
        2 + (baseIndex * markClassCount + classId) * 2
      )
      if (anchorOffset === null) return null

      const anchor = readAnchorPoint(baseArrayReader, anchorOffset)
      if (anchor) {
        anchors[makeMarkClassId(lookup.lookupIndex, subtableIndex, classId)] =
          anchor
      }
    }

    if (Object.keys(anchors).length > 0) {
      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'markBase',
          rules.length
        ),
        kind: 'markToBase',
        baseGlyphs: { kind: 'glyph', glyph: baseGlyphs[baseIndex] },
        anchors,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return { rules, markClasses }
}

const parseMarkToMarkPositioning = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedSubtableResult | null => {
  const mark1CoverageOffset = subtableReader.uint16(2)
  const mark2CoverageOffset = subtableReader.uint16(4)
  const markClassCount = subtableReader.uint16(6)
  const mark1ArrayOffset = subtableReader.uint16(8)
  const mark2ArrayOffset = subtableReader.uint16(10)
  if (
    mark1CoverageOffset === null ||
    mark2CoverageOffset === null ||
    markClassCount === null ||
    mark1ArrayOffset === null ||
    mark2ArrayOffset === null
  ) {
    return null
  }

  const baseMarks = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    mark2CoverageOffset
  )
  const markClasses = parseMarkArray(
    subtableReader,
    glyphOrder,
    mark1CoverageOffset,
    mark1ArrayOffset,
    lookup,
    subtableIndex
  )
  const mark2ArrayReader = subtableReader.at(mark2ArrayOffset)
  const mark2Count = mark2ArrayReader?.uint16(0)
  if (!baseMarks || !markClasses || !mark2ArrayReader || mark2Count === null) {
    return null
  }
  if (baseMarks.length !== mark2Count) return null

  const rules: MarkToMarkRule[] = []
  for (let mark2Index = 0; mark2Index < mark2Count; mark2Index += 1) {
    const anchors: MarkToMarkRule['anchors'] = {}
    for (let classId = 0; classId < markClassCount; classId += 1) {
      const anchorOffset = mark2ArrayReader.uint16(
        2 + (mark2Index * markClassCount + classId) * 2
      )
      if (anchorOffset === null) return null

      const anchor = readAnchorPoint(mark2ArrayReader, anchorOffset)
      if (anchor) {
        anchors[makeMarkClassId(lookup.lookupIndex, subtableIndex, classId)] =
          anchor
      }
    }

    if (Object.keys(anchors).length > 0) {
      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'markMark',
          rules.length
        ),
        kind: 'markToMark',
        baseMarks: { kind: 'glyph', glyph: baseMarks[mark2Index] },
        anchors,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return { rules, markClasses }
}

const parseMarkToLigaturePositioning = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedSubtableResult | null => {
  const markCoverageOffset = subtableReader.uint16(2)
  const ligatureCoverageOffset = subtableReader.uint16(4)
  const markClassCount = subtableReader.uint16(6)
  const markArrayOffset = subtableReader.uint16(8)
  const ligatureArrayOffset = subtableReader.uint16(10)
  if (
    markCoverageOffset === null ||
    ligatureCoverageOffset === null ||
    markClassCount === null ||
    markArrayOffset === null ||
    ligatureArrayOffset === null
  ) {
    return null
  }

  const ligatures = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    ligatureCoverageOffset
  )
  const markClasses = parseMarkArray(
    subtableReader,
    glyphOrder,
    markCoverageOffset,
    markArrayOffset,
    lookup,
    subtableIndex
  )
  const ligatureArrayReader = subtableReader.at(ligatureArrayOffset)
  const ligatureCount = ligatureArrayReader?.uint16(0)
  if (
    !ligatures ||
    !markClasses ||
    !ligatureArrayReader ||
    ligatureCount === null
  ) {
    return null
  }
  if (ligatures.length !== ligatureCount) return null

  const rules: MarkToLigatureRule[] = []
  for (
    let ligatureIndex = 0;
    ligatureIndex < ligatureCount;
    ligatureIndex += 1
  ) {
    const attachOffset = ligatureArrayReader.uint16(2 + ligatureIndex * 2)
    const attachReader =
      attachOffset === null ? null : ligatureArrayReader.at(attachOffset)
    const componentCount = attachReader?.uint16(0)
    if (
      !attachReader ||
      componentCount === null ||
      componentCount === undefined
    ) {
      return null
    }

    const componentAnchors: MarkToLigatureRule['componentAnchors'] = []
    for (
      let componentIndex = 0;
      componentIndex < componentCount;
      componentIndex += 1
    ) {
      const anchors: Record<string, { x: number; y: number }> = {}
      for (let classId = 0; classId < markClassCount; classId += 1) {
        const anchorOffset = attachReader.uint16(
          2 + (componentIndex * markClassCount + classId) * 2
        )
        if (anchorOffset === null) return null

        const anchor = readAnchorPoint(attachReader, anchorOffset)
        if (anchor) {
          anchors[makeMarkClassId(lookup.lookupIndex, subtableIndex, classId)] =
            anchor
        }
      }
      componentAnchors.push(anchors)
    }

    if (componentAnchors.some((anchors) => Object.keys(anchors).length > 0)) {
      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'markLigature',
          rules.length
        ),
        kind: 'markToLigature',
        ligatures: { kind: 'glyph', glyph: ligatures[ligatureIndex] },
        componentAnchors,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return { rules, markClasses }
}

const parseCoverageSelectorClass = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  coverageOffset: number,
  lookup: LayoutLookupInventory,
  subtableIndex: number,
  kind: string,
  index: number,
  glyphClasses: Map<string, GlyphClass>
) => {
  const glyphs = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    coverageOffset
  )
  if (!glyphs?.length) return null
  if (glyphs.length === 1) return { kind: 'glyph' as const, glyph: glyphs[0] }

  const classId = makeClassId(
    lookup.lookupIndex,
    subtableIndex,
    `${kind}_${index}`,
    0
  )
  glyphClasses.set(
    classId,
    makeImportedGlyphClass(
      classId,
      `@GPOS_${lookup.lookupIndex}_${subtableIndex}_${kind}_${index}`,
      glyphs
    )
  )
  return { kind: 'class' as const, classId }
}

const parseContextPositioningFormat3 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number,
  mode: 'context' | 'chaining'
): ParsedSubtableResult | null => {
  const glyphClasses = new Map<string, GlyphClass>()
  const input: ContextInput[] = []
  const backtrack: GlyphSelector[] = []
  const lookahead: GlyphSelector[] = []
  let cursor = 2

  if (mode === 'chaining') {
    const backtrackCount = subtableReader.uint16(cursor)
    if (backtrackCount === null) return null
    cursor += 2
    for (let index = 0; index < backtrackCount; index += 1) {
      const coverageOffset = subtableReader.uint16(cursor)
      if (coverageOffset === null) return null
      const selector = parseCoverageSelectorClass(
        subtableReader,
        glyphOrder,
        coverageOffset,
        lookup,
        subtableIndex,
        'backtrack',
        index,
        glyphClasses
      )
      if (!selector) return null
      backtrack.unshift(selector)
      cursor += 2
    }
  }

  const inputCount = subtableReader.uint16(cursor)
  if (inputCount === null) return null
  cursor += 2
  for (let index = 0; index < inputCount; index += 1) {
    const coverageOffset = subtableReader.uint16(cursor)
    if (coverageOffset === null) return null
    const selector = parseCoverageSelectorClass(
      subtableReader,
      glyphOrder,
      coverageOffset,
      lookup,
      subtableIndex,
      'input',
      index,
      glyphClasses
    )
    if (!selector) return null
    input.push({ selector })
    cursor += 2
  }

  if (mode === 'chaining') {
    const lookaheadCount = subtableReader.uint16(cursor)
    if (lookaheadCount === null) return null
    cursor += 2
    for (let index = 0; index < lookaheadCount; index += 1) {
      const coverageOffset = subtableReader.uint16(cursor)
      if (coverageOffset === null) return null
      const selector = parseCoverageSelectorClass(
        subtableReader,
        glyphOrder,
        coverageOffset,
        lookup,
        subtableIndex,
        'lookahead',
        index,
        glyphClasses
      )
      if (!selector) return null
      lookahead.push(selector)
      cursor += 2
    }
  }

  const lookupRecordCount = subtableReader.uint16(cursor)
  if (lookupRecordCount === null) return null
  cursor += 2
  for (let index = 0; index < lookupRecordCount; index += 1) {
    const sequenceIndex = subtableReader.uint16(cursor)
    const lookupListIndex = subtableReader.uint16(cursor + 2)
    if (sequenceIndex === null || lookupListIndex === null) return null
    const contextInput = input[sequenceIndex]
    if (!contextInput) return null
    contextInput.lookupIds = [
      ...(contextInput.lookupIds ?? []),
      `lookup_gpos_${lookupListIndex}`,
    ]
    cursor += 4
  }

  return {
    rules: [
      {
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          mode === 'context' ? 'context' : 'chainingContext',
          0
        ),
        kind: 'contextualPositioning',
        mode,
        backtrack,
        input,
        lookahead,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      },
    ],
    glyphClasses: Array.from(glyphClasses.values()),
  }
}

const parseSupportedSubtable = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedSubtableResult | null => {
  const format = subtableReader.uint16(0)
  if (format !== lookup.subtableFormats[subtableIndex]) return null

  if (lookup.lookupType === 1) {
    const rules = parseSinglePositioning(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
    return rules ? { rules } : null
  }

  if (lookup.lookupType === 2 && format === 1) {
    const rules = parsePairPositioningFormat1(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
    return rules ? { rules } : null
  }

  if (lookup.lookupType === 2 && format === 2) {
    return parsePairPositioningFormat2(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  if (lookup.lookupType === 3 && format === 1) {
    const rules = parseCursivePositioning(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
    return rules ? { rules } : null
  }

  if (lookup.lookupType === 4 && format === 1) {
    return parseMarkToBasePositioning(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  if (lookup.lookupType === 5 && format === 1) {
    return parseMarkToLigaturePositioning(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  if (lookup.lookupType === 6 && format === 1) {
    return parseMarkToMarkPositioning(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  if (lookup.lookupType === 7 && format === 3) {
    return parseContextPositioningFormat3(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex,
      'context'
    )
  }

  if (lookup.lookupType === 8 && format === 3) {
    return parseContextPositioningFormat3(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex,
      'chaining'
    )
  }

  if (lookup.lookupType === 9 && format === 1) {
    const extensionLookupType = subtableReader.uint16(2)
    const extensionOffset = subtableReader.uint32(4)
    const extensionReader =
      extensionOffset === null ? null : subtableReader.at(extensionOffset)
    if (
      extensionLookupType === null ||
      extensionLookupType === 9 ||
      !extensionReader
    ) {
      return null
    }

    return parseSupportedSubtable(
      extensionReader,
      glyphOrder,
      {
        ...lookup,
        lookupType: extensionLookupType,
        subtableFormats: [extensionReader.uint16(0) ?? 0],
      },
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
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(lookup.lookupType)) {
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
  const glyphClasses = new Map<string, GlyphClass>()
  const markClasses = new Map<string, MarkClass>()

  for (
    let subtableIndex = 0;
    subtableIndex < lookup.subtableOffsets.length;
    subtableIndex += 1
  ) {
    const subtableReader = tableReader.at(lookup.subtableOffsets[subtableIndex])
    const parsedSubtable = subtableReader
      ? parseSupportedSubtable(
          subtableReader,
          glyphOrder,
          lookup,
          subtableIndex
        )
      : null

    if (!parsedSubtable) {
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

    rules.push(...parsedSubtable.rules)
    for (const glyphClass of parsedSubtable.glyphClasses ?? []) {
      glyphClasses.set(glyphClass.id, glyphClass)
    }
    for (const markClass of parsedSubtable.markClasses ?? []) {
      markClasses.set(markClass.id, markClass)
    }
  }

  return {
    rules,
    diagnostics,
    glyphClasses: Array.from(glyphClasses.values()),
    markClasses: Array.from(markClasses.values()),
  }
}
