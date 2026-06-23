import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import {
  makeImportedGlyphClass,
  readClassDefGlyphIds,
  readCoverageGlyphIds,
  resolveGlyphNames,
} from 'src/lib/openTypeFeatures/gposBinaryStructures'
import type { LayoutLookupInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
import type {
  ContextInput,
  ContextualRule,
  GlyphClass,
  GlyphSelector,
  SourceProvenance,
} from 'src/lib/openTypeFeatures/types'

interface ParsedContextPositioningSubtable {
  rules: ContextualRule[]
  glyphClasses?: GlyphClass[]
}

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

const glyphIdsForClassSelector = (
  classGlyphIds: Map<number, number[]>,
  classId: number,
  fallbackGlyphIds?: number[]
) => {
  if (classId === 0) {
    if (!fallbackGlyphIds) return null

    const assignedGlyphIds = new Set(
      Array.from(classGlyphIds.entries()).flatMap(
        ([currentClassId, glyphIds]) => (currentClassId === 0 ? [] : glyphIds)
      )
    )
    return fallbackGlyphIds.filter((glyphId) => !assignedGlyphIds.has(glyphId))
  }

  const explicitGlyphIds = classGlyphIds.get(classId) ?? []
  const fallbackGlyphIdSet = fallbackGlyphIds ? new Set(fallbackGlyphIds) : null
  const glyphIds = fallbackGlyphIdSet
    ? explicitGlyphIds.filter((glyphId) => fallbackGlyphIdSet.has(glyphId))
    : explicitGlyphIds

  return Array.from(new Set(glyphIds)).sort((left, right) => left - right)
}

const parseClassSelector = (
  classGlyphIds: Map<number, number[]>,
  glyphOrder: string[],
  classId: number,
  lookup: LayoutLookupInventory,
  subtableIndex: number,
  kind: string,
  glyphClasses: Map<string, GlyphClass>,
  fallbackGlyphIds?: number[]
): GlyphSelector | null => {
  const glyphIds = glyphIdsForClassSelector(
    classGlyphIds,
    classId,
    fallbackGlyphIds
  )
  if (!glyphIds?.length) return null

  const glyphs = resolveGlyphNames(glyphOrder, glyphIds)
  if (!glyphs) return null
  if (glyphs.length === 1) return { kind: 'glyph', glyph: glyphs[0] }

  const selectorClassId = makeClassId(
    lookup.lookupIndex,
    subtableIndex,
    kind,
    classId
  )
  glyphClasses.set(
    selectorClassId,
    makeImportedGlyphClass(
      selectorClassId,
      `@GPOS_${lookup.lookupIndex}_${subtableIndex}_${kind}_class_${classId}`,
      glyphs
    )
  )
  return { kind: 'class', classId: selectorClassId }
}

const readPosLookupRecords = (
  reader: BinaryReader,
  offset: number,
  count: number
) => {
  const records: Array<{ sequenceIndex: number; lookupIndex: number }> = []
  for (let index = 0; index < count; index += 1) {
    const recordOffset = offset + index * 4
    const sequenceIndex = reader.uint16(recordOffset)
    const lookupIndex = reader.uint16(recordOffset + 2)
    if (sequenceIndex === null || lookupIndex === null) return null
    records.push({ sequenceIndex, lookupIndex })
  }
  return records
}

const attachLookupRecords = (
  input: ContextInput[],
  records: Array<{ sequenceIndex: number; lookupIndex: number }>
) => {
  for (const record of records) {
    const target = input[record.sequenceIndex]
    if (!target) return null

    target.lookupIds = [
      ...(target.lookupIds ?? []),
      `lookup_gpos_${record.lookupIndex}`,
    ]
  }
  return input
}

export const parseContextPositioningFormat2 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedContextPositioningSubtable | null => {
  const coverageOffset = subtableReader.uint16(2)
  const classDefOffset = subtableReader.uint16(4)
  const posClassSetCount = subtableReader.uint16(6)
  if (
    coverageOffset === null ||
    classDefOffset === null ||
    posClassSetCount === null
  ) {
    return null
  }

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const classGlyphIds = readClassDefGlyphIds(subtableReader, classDefOffset)
  if (!coverageGlyphIds || !classGlyphIds) return null

  const glyphClasses = new Map<string, GlyphClass>()
  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < posClassSetCount; setIndex += 1) {
    const setOffset = subtableReader.uint16(8 + setIndex * 2)
    if (!setOffset) continue

    const firstSelector = parseClassSelector(
      classGlyphIds,
      glyphOrder,
      setIndex,
      lookup,
      subtableIndex,
      'input_0',
      glyphClasses,
      coverageGlyphIds
    )
    if (!firstSelector) return null

    const setReader = subtableReader.at(setOffset)
    const posRuleCount = setReader?.uint16(0)
    if (!setReader || posRuleCount === null || posRuleCount === undefined) {
      return null
    }

    for (let ruleIndex = 0; ruleIndex < posRuleCount; ruleIndex += 1) {
      const ruleOffset = setReader.uint16(2 + ruleIndex * 2)
      const ruleReader = ruleOffset === null ? null : setReader.at(ruleOffset)
      const glyphCount = ruleReader?.uint16(0)
      const posCount = ruleReader?.uint16(2)
      if (
        !ruleReader ||
        glyphCount === null ||
        glyphCount === undefined ||
        posCount === null ||
        posCount === undefined ||
        glyphCount < 1
      ) {
        return null
      }

      const input: ContextInput[] = [{ selector: firstSelector }]
      let cursor = 4
      for (let inputIndex = 1; inputIndex < glyphCount; inputIndex += 1) {
        const classId = ruleReader.uint16(cursor)
        if (classId === null) return null

        const selector = parseClassSelector(
          classGlyphIds,
          glyphOrder,
          classId,
          lookup,
          subtableIndex,
          `input_${inputIndex}`,
          glyphClasses
        )
        if (!selector) return null

        input.push({ selector })
        cursor += 2
      }

      const records = readPosLookupRecords(ruleReader, cursor, posCount)
      if (!records) return null
      const inputWithLookups = attachLookupRecords(input, records)
      if (!inputWithLookups) return null

      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'context',
          rules.length
        ),
        kind: 'contextualPositioning',
        mode: 'context',
        backtrack: [],
        input: inputWithLookups,
        lookahead: [],
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return {
    rules,
    glyphClasses: Array.from(glyphClasses.values()),
  }
}

export const parseChainingContextPositioningFormat2 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedContextPositioningSubtable | null => {
  const coverageOffset = subtableReader.uint16(2)
  const backtrackClassDefOffset = subtableReader.uint16(4)
  const inputClassDefOffset = subtableReader.uint16(6)
  const lookaheadClassDefOffset = subtableReader.uint16(8)
  const chainPosClassSetCount = subtableReader.uint16(10)
  if (
    coverageOffset === null ||
    backtrackClassDefOffset === null ||
    inputClassDefOffset === null ||
    lookaheadClassDefOffset === null ||
    chainPosClassSetCount === null
  ) {
    return null
  }

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const backtrackClassGlyphIds = readClassDefGlyphIds(
    subtableReader,
    backtrackClassDefOffset
  )
  const inputClassGlyphIds = readClassDefGlyphIds(
    subtableReader,
    inputClassDefOffset
  )
  const lookaheadClassGlyphIds = readClassDefGlyphIds(
    subtableReader,
    lookaheadClassDefOffset
  )
  if (
    !coverageGlyphIds ||
    !backtrackClassGlyphIds ||
    !inputClassGlyphIds ||
    !lookaheadClassGlyphIds
  ) {
    return null
  }

  const glyphClasses = new Map<string, GlyphClass>()
  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < chainPosClassSetCount; setIndex += 1) {
    const setOffset = subtableReader.uint16(12 + setIndex * 2)
    if (!setOffset) continue

    const firstInputSelector = parseClassSelector(
      inputClassGlyphIds,
      glyphOrder,
      setIndex,
      lookup,
      subtableIndex,
      'input_0',
      glyphClasses,
      coverageGlyphIds
    )
    if (!firstInputSelector) return null

    const setReader = subtableReader.at(setOffset)
    const posRuleCount = setReader?.uint16(0)
    if (!setReader || posRuleCount === null || posRuleCount === undefined) {
      return null
    }

    for (let ruleIndex = 0; ruleIndex < posRuleCount; ruleIndex += 1) {
      const ruleOffset = setReader.uint16(2 + ruleIndex * 2)
      const ruleReader = ruleOffset === null ? null : setReader.at(ruleOffset)
      const backtrackGlyphCount = ruleReader?.uint16(0)
      if (
        !ruleReader ||
        backtrackGlyphCount === null ||
        backtrackGlyphCount === undefined
      ) {
        return null
      }

      const backtrack: GlyphSelector[] = []
      let cursor = 2
      for (let index = 0; index < backtrackGlyphCount; index += 1) {
        const classId = ruleReader.uint16(cursor)
        if (classId === null) return null

        const selector = parseClassSelector(
          backtrackClassGlyphIds,
          glyphOrder,
          classId,
          lookup,
          subtableIndex,
          `backtrack_${index}`,
          glyphClasses
        )
        if (!selector) return null

        backtrack.unshift(selector)
        cursor += 2
      }

      const inputGlyphCount = ruleReader.uint16(cursor)
      if (inputGlyphCount === null || inputGlyphCount < 1) return null
      cursor += 2

      const input: ContextInput[] = [{ selector: firstInputSelector }]
      for (let index = 1; index < inputGlyphCount; index += 1) {
        const classId = ruleReader.uint16(cursor)
        if (classId === null) return null

        const selector = parseClassSelector(
          inputClassGlyphIds,
          glyphOrder,
          classId,
          lookup,
          subtableIndex,
          `input_${index}`,
          glyphClasses
        )
        if (!selector) return null

        input.push({ selector })
        cursor += 2
      }

      const lookaheadGlyphCount = ruleReader.uint16(cursor)
      if (lookaheadGlyphCount === null) return null
      cursor += 2

      const lookahead: GlyphSelector[] = []
      for (let index = 0; index < lookaheadGlyphCount; index += 1) {
        const classId = ruleReader.uint16(cursor)
        if (classId === null) return null

        const selector = parseClassSelector(
          lookaheadClassGlyphIds,
          glyphOrder,
          classId,
          lookup,
          subtableIndex,
          `lookahead_${index}`,
          glyphClasses
        )
        if (!selector) return null

        lookahead.push(selector)
        cursor += 2
      }

      const posCount = ruleReader.uint16(cursor)
      if (posCount === null) return null
      cursor += 2

      const records = readPosLookupRecords(ruleReader, cursor, posCount)
      if (!records) return null
      const inputWithLookups = attachLookupRecords(input, records)
      if (!inputWithLookups) return null

      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'chaining',
          rules.length
        ),
        kind: 'contextualPositioning',
        mode: 'chaining',
        backtrack,
        input: inputWithLookups,
        lookahead,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return {
    rules,
    glyphClasses: Array.from(glyphClasses.values()),
  }
}
