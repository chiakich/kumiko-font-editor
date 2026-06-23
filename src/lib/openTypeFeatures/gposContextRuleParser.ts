import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import {
  makeImportedGlyphClass,
  readCoverageGlyphIds,
  readCoverageGlyphNames,
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

const resolveGlyphSelectors = (
  glyphOrder: string[],
  glyphIds: number[]
): GlyphSelector[] | null => {
  const glyphNames = resolveGlyphNames(glyphOrder, glyphIds)
  return glyphNames
    ? glyphNames.map((glyph) => ({ kind: 'glyph' as const, glyph }))
    : null
}

const attachPositioningRecords = (
  input: ContextInput[],
  ruleReader: BinaryReader,
  recordOffset: number,
  recordCount: number
) => {
  let cursor = recordOffset
  for (let index = 0; index < recordCount; index += 1) {
    const sequenceIndex = ruleReader.uint16(cursor)
    const lookupListIndex = ruleReader.uint16(cursor + 2)
    if (sequenceIndex === null || lookupListIndex === null) return null

    const contextInput = input[sequenceIndex]
    if (!contextInput) return null
    contextInput.lookupIds = [
      ...(contextInput.lookupIds ?? []),
      `lookup_gpos_${lookupListIndex}`,
    ]
    cursor += 4
  }

  return input
}

export const parseContextPositioningFormat1 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedContextPositioningSubtable | null => {
  const coverageOffset = subtableReader.uint16(2)
  const posRuleSetCount = subtableReader.uint16(4)
  if (coverageOffset === null || posRuleSetCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageSelectors = coverageGlyphIds
    ? resolveGlyphSelectors(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageSelectors || coverageSelectors.length !== posRuleSetCount) {
    return null
  }

  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < posRuleSetCount; setIndex += 1) {
    const setOffset = subtableReader.uint16(6 + setIndex * 2)
    if (setOffset === null) return null
    if (setOffset === 0) continue

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

      const trailingGlyphIds: number[] = []
      for (let index = 1; index < glyphCount; index += 1) {
        const glyphId = ruleReader.uint16(2 + index * 2)
        if (glyphId === null) return null
        trailingGlyphIds.push(glyphId)
      }

      const trailingSelectors = resolveGlyphSelectors(
        glyphOrder,
        trailingGlyphIds
      )
      if (!trailingSelectors) return null

      const input = attachPositioningRecords(
        [
          { selector: coverageSelectors[setIndex] },
          ...trailingSelectors.map((selector) => ({ selector })),
        ],
        ruleReader,
        4 + trailingGlyphIds.length * 2,
        posCount
      )
      if (!input) return null

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
        input,
        lookahead: [],
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return { rules }
}

export const parseChainingContextPositioningFormat1 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedContextPositioningSubtable | null => {
  const coverageOffset = subtableReader.uint16(2)
  const chainPosRuleSetCount = subtableReader.uint16(4)
  if (coverageOffset === null || chainPosRuleSetCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageSelectors = coverageGlyphIds
    ? resolveGlyphSelectors(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageSelectors || coverageSelectors.length !== chainPosRuleSetCount) {
    return null
  }

  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < chainPosRuleSetCount; setIndex += 1) {
    const setOffset = subtableReader.uint16(6 + setIndex * 2)
    if (setOffset === null) return null
    if (setOffset === 0) continue

    const setReader = subtableReader.at(setOffset)
    const chainPosRuleCount = setReader?.uint16(0)
    if (
      !setReader ||
      chainPosRuleCount === null ||
      chainPosRuleCount === undefined
    ) {
      return null
    }

    for (let ruleIndex = 0; ruleIndex < chainPosRuleCount; ruleIndex += 1) {
      const ruleOffset = setReader.uint16(2 + ruleIndex * 2)
      const ruleReader = ruleOffset === null ? null : setReader.at(ruleOffset)
      const backtrackCount = ruleReader?.uint16(0)
      if (
        !ruleReader ||
        backtrackCount === null ||
        backtrackCount === undefined
      ) {
        return null
      }

      const backtrackGlyphIds: number[] = []
      for (let index = 0; index < backtrackCount; index += 1) {
        const glyphId = ruleReader.uint16(2 + index * 2)
        if (glyphId === null) return null
        backtrackGlyphIds.push(glyphId)
      }

      let cursor = 2 + backtrackCount * 2
      const inputGlyphCount = ruleReader.uint16(cursor)
      if (inputGlyphCount === null || inputGlyphCount < 1) return null
      cursor += 2

      const trailingInputGlyphIds: number[] = []
      for (let index = 1; index < inputGlyphCount; index += 1) {
        const glyphId = ruleReader.uint16(cursor)
        if (glyphId === null) return null
        trailingInputGlyphIds.push(glyphId)
        cursor += 2
      }

      const lookaheadGlyphCount = ruleReader.uint16(cursor)
      if (lookaheadGlyphCount === null) return null
      cursor += 2

      const lookaheadGlyphIds: number[] = []
      for (let index = 0; index < lookaheadGlyphCount; index += 1) {
        const glyphId = ruleReader.uint16(cursor)
        if (glyphId === null) return null
        lookaheadGlyphIds.push(glyphId)
        cursor += 2
      }

      const posCount = ruleReader.uint16(cursor)
      if (posCount === null) return null
      cursor += 2

      const backtrack = resolveGlyphSelectors(
        glyphOrder,
        backtrackGlyphIds
      )?.reverse()
      const trailingInput = resolveGlyphSelectors(
        glyphOrder,
        trailingInputGlyphIds
      )
      const lookahead = resolveGlyphSelectors(glyphOrder, lookaheadGlyphIds)
      if (!backtrack || !trailingInput || !lookahead) return null

      const input = attachPositioningRecords(
        [
          { selector: coverageSelectors[setIndex] },
          ...trailingInput.map((selector) => ({ selector })),
        ],
        ruleReader,
        cursor,
        posCount
      )
      if (!input) return null

      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'chainingContext',
          rules.length
        ),
        kind: 'contextualPositioning',
        mode: 'chaining',
        backtrack,
        input,
        lookahead,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return { rules }
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

export const parseContextPositioningFormat3 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number,
  mode: 'context' | 'chaining'
): ParsedContextPositioningSubtable | null => {
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
  const inputWithLookups = attachPositioningRecords(
    input,
    subtableReader,
    cursor,
    lookupRecordCount
  )
  if (!inputWithLookups) return null

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
        input: inputWithLookups,
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
