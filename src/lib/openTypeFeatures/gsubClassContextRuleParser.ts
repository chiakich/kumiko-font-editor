import { BinaryReader } from '@/lib/openTypeFeatures/binaryReader'
import {
  attachLookupRecords,
  makeClassId,
  makeImportedGlyphClass,
  makeProvenance,
  makeRuleId,
  readCoverageGlyphIds,
  readSubstLookupRecords,
  resolveGlyphNames,
  type GsubContextSubtableParseResult,
} from '@/lib/openTypeFeatures/gsubContextRuleParser'
import type { LayoutLookupInventory } from '@/lib/openTypeFeatures/layoutTableInventory'
import type {
  ContextInput,
  ContextualRule,
  GlyphClass,
  GlyphSelector,
} from '@/lib/openTypeFeatures/types'

const readClassDefGlyphIds = (
  subtableReader: BinaryReader,
  classDefOffset: number
) => {
  const classDefReader = subtableReader.at(classDefOffset)
  const classFormat = classDefReader?.uint16(0)
  if (!classDefReader || classFormat === null || classFormat === undefined) {
    return null
  }

  const classGlyphIds = new Map<number, number[]>()
  const addGlyphId = (classId: number, glyphId: number) => {
    const glyphIds = classGlyphIds.get(classId) ?? []
    glyphIds.push(glyphId)
    classGlyphIds.set(classId, glyphIds)
  }

  if (classFormat === 1) {
    const startGlyphId = classDefReader.uint16(2)
    const glyphCount = classDefReader.uint16(4)
    if (startGlyphId === null || glyphCount === null) return null

    for (let index = 0; index < glyphCount; index += 1) {
      const classId = classDefReader.uint16(6 + index * 2)
      if (classId === null) return null
      addGlyphId(classId, startGlyphId + index)
    }
    return classGlyphIds
  }

  if (classFormat === 2) {
    const classRangeCount = classDefReader.uint16(2)
    if (classRangeCount === null) return null

    for (let rangeIndex = 0; rangeIndex < classRangeCount; rangeIndex += 1) {
      const rangeOffset = 4 + rangeIndex * 6
      const startGlyphId = classDefReader.uint16(rangeOffset)
      const endGlyphId = classDefReader.uint16(rangeOffset + 2)
      const classId = classDefReader.uint16(rangeOffset + 4)
      if (startGlyphId === null || endGlyphId === null || classId === null) {
        return null
      }

      for (let glyphId = startGlyphId; glyphId <= endGlyphId; glyphId += 1) {
        addGlyphId(classId, glyphId)
      }
    }
    return classGlyphIds
  }

  return null
}

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
      `@GSUB_${lookup.lookupIndex}_${subtableIndex}_${kind}_class_${classId}`,
      glyphs
    )
  )
  return { kind: 'class', classId: selectorClassId }
}

export const parseContextSubstitutionFormat2 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): GsubContextSubtableParseResult | null => {
  const coverageOffset = subtableReader.uint16(2)
  const classDefOffset = subtableReader.uint16(4)
  const subClassSetCount = subtableReader.uint16(6)
  if (
    coverageOffset === null ||
    classDefOffset === null ||
    subClassSetCount === null
  ) {
    return null
  }

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const classGlyphIds = readClassDefGlyphIds(subtableReader, classDefOffset)
  if (!coverageGlyphIds || !classGlyphIds) return null

  const glyphClasses = new Map<string, GlyphClass>()
  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < subClassSetCount; setIndex += 1) {
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
    const subRuleCount = setReader?.uint16(0)
    if (!setReader || subRuleCount === null || subRuleCount === undefined) {
      return null
    }

    for (let ruleIndex = 0; ruleIndex < subRuleCount; ruleIndex += 1) {
      const ruleOffset = setReader.uint16(2 + ruleIndex * 2)
      const ruleReader = ruleOffset === null ? null : setReader.at(ruleOffset)
      const glyphCount = ruleReader?.uint16(0)
      const substCount = ruleReader?.uint16(2)
      if (
        !ruleReader ||
        glyphCount === null ||
        glyphCount === undefined ||
        substCount === null ||
        substCount === undefined ||
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

      const records = readSubstLookupRecords(ruleReader, cursor, substCount)
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
        kind: 'contextualSubstitution',
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

export const parseChainingContextSubstitutionFormat2 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): GsubContextSubtableParseResult | null => {
  const coverageOffset = subtableReader.uint16(2)
  const backtrackClassDefOffset = subtableReader.uint16(4)
  const inputClassDefOffset = subtableReader.uint16(6)
  const lookaheadClassDefOffset = subtableReader.uint16(8)
  const chainSubClassSetCount = subtableReader.uint16(10)
  if (
    coverageOffset === null ||
    backtrackClassDefOffset === null ||
    inputClassDefOffset === null ||
    lookaheadClassDefOffset === null ||
    chainSubClassSetCount === null
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
  for (let setIndex = 0; setIndex < chainSubClassSetCount; setIndex += 1) {
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
    const subRuleCount = setReader?.uint16(0)
    if (!setReader || subRuleCount === null || subRuleCount === undefined) {
      return null
    }

    for (let ruleIndex = 0; ruleIndex < subRuleCount; ruleIndex += 1) {
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

      const substCount = ruleReader.uint16(cursor)
      if (substCount === null) return null
      cursor += 2

      const records = readSubstLookupRecords(ruleReader, cursor, substCount)
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
        kind: 'contextualSubstitution',
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
