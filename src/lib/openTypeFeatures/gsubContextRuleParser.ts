import { BinaryReader } from '@/lib/openTypeFeatures/binaryReader'
import type { LayoutLookupInventory } from '@/lib/openTypeFeatures/layoutTableInventory'
import type {
  ContextInput,
  ContextualRule,
  GlyphClass,
  GlyphSelector,
  SourceProvenance,
} from '@/lib/openTypeFeatures/types'

export interface GsubContextSubtableParseResult {
  rules: ContextualRule[]
  glyphClasses?: GlyphClass[]
}

const glyphNameForId = (glyphOrder: string[], glyphId: number) =>
  glyphOrder[glyphId] ?? null

export const makeRuleId = (
  lookupIndex: number,
  subtableIndex: number,
  kind: string,
  ruleIndex: number
) => `rule_gsub_${lookupIndex}_${subtableIndex}_${kind}_${ruleIndex}`

export const makeClassId = (
  lookupIndex: number,
  subtableIndex: number,
  kind: string,
  classId: number
) => `class_gsub_${lookupIndex}_${subtableIndex}_${kind}_${classId}`

export const makeProvenance = (
  lookup: LayoutLookupInventory,
  subtableIndex: number
): SourceProvenance => ({
  table: 'GSUB',
  lookupIndex: lookup.lookupIndex,
  lookupType: lookup.lookupType,
  subtableIndex,
  subtableFormat: lookup.subtableFormats[subtableIndex],
})

export const readCoverageGlyphIds = (
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

export const resolveGlyphNames = (glyphOrder: string[], glyphIds: number[]) => {
  const glyphNames = glyphIds.map((glyphId) =>
    glyphNameForId(glyphOrder, glyphId)
  )
  return glyphNames.every(
    (glyphName): glyphName is string => glyphName !== null
  )
    ? glyphNames
    : null
}

const readCoverageGlyphNames = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  coverageOffset: number
) => {
  const glyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  return glyphIds ? resolveGlyphNames(glyphOrder, glyphIds) : null
}

export const makeImportedGlyphClass = (
  id: string,
  name: string,
  glyphs: string[]
): GlyphClass => ({
  id,
  name,
  glyphs,
  origin: 'imported',
})

const resolveGlyphSelectors = (
  glyphOrder: string[],
  glyphIds: number[]
): GlyphSelector[] | null => {
  const selectors: Array<GlyphSelector | null> = glyphIds.map((glyphId) => {
    const glyph = glyphNameForId(glyphOrder, glyphId)
    return glyph ? ({ kind: 'glyph', glyph } satisfies GlyphSelector) : null
  })

  return selectors.every(
    (selector): selector is GlyphSelector => selector !== null
  )
    ? selectors
    : null
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
): GlyphSelector | null => {
  const glyphs = readCoverageGlyphNames(
    subtableReader,
    glyphOrder,
    coverageOffset
  )
  if (!glyphs?.length) return null
  if (glyphs.length === 1) return { kind: 'glyph', glyph: glyphs[0] }

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
      `@GSUB_${lookup.lookupIndex}_${subtableIndex}_${kind}_${index}`,
      glyphs
    )
  )
  return { kind: 'class', classId }
}

export const readSubstLookupRecords = (
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

export const attachLookupRecords = (
  input: ContextInput[],
  records: Array<{ sequenceIndex: number; lookupIndex: number }>
) => {
  for (const record of records) {
    const target = input[record.sequenceIndex]
    if (!target) return null

    target.lookupIds = [
      ...(target.lookupIds ?? []),
      `lookup_gsub_${record.lookupIndex}`,
    ]
  }
  return input
}

export const parseContextSubstitutionFormat1 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ContextualRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const subRuleSetCount = subtableReader.uint16(4)
  if (coverageOffset === null || subRuleSetCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageSelectors = coverageGlyphIds
    ? resolveGlyphSelectors(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageSelectors || coverageSelectors.length !== subRuleSetCount) {
    return null
  }

  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < subRuleSetCount; setIndex += 1) {
    const setOffset = subtableReader.uint16(6 + setIndex * 2)
    if (!setOffset) continue

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

      const trailingGlyphIds: number[] = []
      for (let glyphIndex = 1; glyphIndex < glyphCount; glyphIndex += 1) {
        const glyphId = ruleReader.uint16(4 + (glyphIndex - 1) * 2)
        if (glyphId === null) return null
        trailingGlyphIds.push(glyphId)
      }

      const trailingSelectors = resolveGlyphSelectors(
        glyphOrder,
        trailingGlyphIds
      )
      if (!trailingSelectors) return null

      const records = readSubstLookupRecords(
        ruleReader,
        4 + trailingGlyphIds.length * 2,
        substCount
      )
      if (!records) return null

      const input = attachLookupRecords(
        [
          { selector: coverageSelectors[setIndex] },
          ...trailingSelectors.map((selector) => ({ selector })),
        ],
        records
      )
      if (!input) return null

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
        input,
        lookahead: [],
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return rules
}

export const parseContextSubstitutionFormat3 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): GsubContextSubtableParseResult | null => {
  const glyphClasses = new Map<string, GlyphClass>()
  const input: ContextInput[] = []
  let cursor = 2

  const glyphCount = subtableReader.uint16(cursor)
  if (glyphCount === null || glyphCount < 1) return null
  cursor += 2

  for (let index = 0; index < glyphCount; index += 1) {
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

  const substCount = subtableReader.uint16(cursor)
  if (substCount === null) return null
  cursor += 2

  const records = readSubstLookupRecords(subtableReader, cursor, substCount)
  if (!records) return null
  const inputWithLookups = attachLookupRecords(input, records)
  if (!inputWithLookups) return null

  return {
    rules: [
      {
        id: makeRuleId(lookup.lookupIndex, subtableIndex, 'context', 0),
        kind: 'contextualSubstitution',
        mode: 'context',
        backtrack: [],
        input: inputWithLookups,
        lookahead: [],
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      },
    ],
    glyphClasses: Array.from(glyphClasses.values()),
  }
}

export const parseChainingContextSubstitutionFormat1 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ContextualRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const chainSubRuleSetCount = subtableReader.uint16(4)
  if (coverageOffset === null || chainSubRuleSetCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageSelectors = coverageGlyphIds
    ? resolveGlyphSelectors(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageSelectors || coverageSelectors.length !== chainSubRuleSetCount) {
    return null
  }

  const rules: ContextualRule[] = []
  for (let setIndex = 0; setIndex < chainSubRuleSetCount; setIndex += 1) {
    const setOffset = subtableReader.uint16(6 + setIndex * 2)
    if (!setOffset) continue

    const setReader = subtableReader.at(setOffset)
    const subRuleCount = setReader?.uint16(0)
    if (!setReader || subRuleCount === null || subRuleCount === undefined) {
      return null
    }

    for (let ruleIndex = 0; ruleIndex < subRuleCount; ruleIndex += 1) {
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

      const substCount = ruleReader.uint16(cursor)
      if (substCount === null) return null
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
      const records = readSubstLookupRecords(ruleReader, cursor, substCount)
      if (!backtrack || !trailingInput || !lookahead || !records) return null

      const input = attachLookupRecords(
        [
          { selector: coverageSelectors[setIndex] },
          ...trailingInput.map((selector) => ({ selector })),
        ],
        records
      )
      if (!input) return null

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
        input,
        lookahead,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
  }

  return rules
}

export const parseChainingContextSubstitutionFormat3 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): GsubContextSubtableParseResult | null => {
  const glyphClasses = new Map<string, GlyphClass>()
  const input: ContextInput[] = []
  const backtrack: GlyphSelector[] = []
  const lookahead: GlyphSelector[] = []
  let cursor = 2

  const backtrackGlyphCount = subtableReader.uint16(cursor)
  if (backtrackGlyphCount === null) return null
  cursor += 2
  for (let index = 0; index < backtrackGlyphCount; index += 1) {
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

  const inputGlyphCount = subtableReader.uint16(cursor)
  if (inputGlyphCount === null || inputGlyphCount < 1) return null
  cursor += 2
  for (let index = 0; index < inputGlyphCount; index += 1) {
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

  const lookaheadGlyphCount = subtableReader.uint16(cursor)
  if (lookaheadGlyphCount === null) return null
  cursor += 2
  for (let index = 0; index < lookaheadGlyphCount; index += 1) {
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

  const substCount = subtableReader.uint16(cursor)
  if (substCount === null) return null
  cursor += 2

  const records = readSubstLookupRecords(subtableReader, cursor, substCount)
  if (!records) return null
  const inputWithLookups = attachLookupRecords(input, records)
  if (!inputWithLookups) return null

  return {
    rules: [
      {
        id: makeRuleId(lookup.lookupIndex, subtableIndex, 'chaining', 0),
        kind: 'contextualSubstitution',
        mode: 'chaining',
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
