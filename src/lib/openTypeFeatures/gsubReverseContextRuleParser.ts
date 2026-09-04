import { BinaryReader } from '@/lib/openTypeFeatures/binaryReader'
import {
  makeClassId,
  makeImportedGlyphClass,
  makeProvenance,
  makeRuleId,
  readCoverageGlyphIds,
  resolveGlyphNames,
} from '@/lib/openTypeFeatures/gsubContextRuleParser'
import type { LayoutLookupInventory } from '@/lib/openTypeFeatures/layoutTableInventory'
import type {
  GlyphClass,
  GlyphSelector,
  ReverseChainingSingleSubstitutionRule,
} from '@/lib/openTypeFeatures/types'

interface ParsedReverseContextSubtable {
  rules: ReverseChainingSingleSubstitutionRule[]
  glyphClasses?: GlyphClass[]
}

const parseCoverageSelector = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  coverageOffset: number,
  lookup: LayoutLookupInventory,
  subtableIndex: number,
  kind: string,
  index: number,
  glyphClasses: Map<string, GlyphClass>
): GlyphSelector | null => {
  const glyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const glyphs = glyphIds ? resolveGlyphNames(glyphOrder, glyphIds) : null
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

export const parseReverseChainingSingleSubstitutionFormat1 = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): ParsedReverseContextSubtable | null => {
  const coverageOffset = subtableReader.uint16(2)
  if (coverageOffset === null) return null

  const targetGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const targetGlyphs = targetGlyphIds
    ? resolveGlyphNames(glyphOrder, targetGlyphIds)
    : null
  if (!targetGlyphIds || !targetGlyphs) return null

  const glyphClasses = new Map<string, GlyphClass>()
  const backtrack: GlyphSelector[] = []
  const lookahead: GlyphSelector[] = []
  let cursor = 4

  const backtrackGlyphCount = subtableReader.uint16(cursor)
  if (backtrackGlyphCount === null) return null
  cursor += 2

  for (let index = 0; index < backtrackGlyphCount; index += 1) {
    const backtrackCoverageOffset = subtableReader.uint16(cursor)
    if (backtrackCoverageOffset === null) return null

    const selector = parseCoverageSelector(
      subtableReader,
      glyphOrder,
      backtrackCoverageOffset,
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

  const lookaheadGlyphCount = subtableReader.uint16(cursor)
  if (lookaheadGlyphCount === null) return null
  cursor += 2

  for (let index = 0; index < lookaheadGlyphCount; index += 1) {
    const lookaheadCoverageOffset = subtableReader.uint16(cursor)
    if (lookaheadCoverageOffset === null) return null

    const selector = parseCoverageSelector(
      subtableReader,
      glyphOrder,
      lookaheadCoverageOffset,
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

  const glyphCount = subtableReader.uint16(cursor)
  if (glyphCount === null || glyphCount !== targetGlyphs.length) return null
  cursor += 2

  const rules: ReverseChainingSingleSubstitutionRule[] = []
  for (let index = 0; index < glyphCount; index += 1) {
    const substituteGlyphId = subtableReader.uint16(cursor + index * 2)
    const replacement =
      substituteGlyphId === null
        ? null
        : (glyphOrder[substituteGlyphId] ?? null)
    if (!replacement) return null

    rules.push({
      id: makeRuleId(
        lookup.lookupIndex,
        subtableIndex,
        'reverseChaining',
        index
      ),
      kind: 'reverseChainingSingleSubstitution',
      backtrack,
      target: { kind: 'glyph', glyph: targetGlyphs[index] },
      lookahead,
      replacement,
      meta: {
        origin: 'imported',
        provenance: makeProvenance(lookup, subtableIndex),
      },
    })
  }

  return {
    rules,
    glyphClasses: Array.from(glyphClasses.values()),
  }
}
