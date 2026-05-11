import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import {
  parseChainingContextSubstitutionFormat1,
  parseContextSubstitutionFormat1,
} from 'src/lib/openTypeFeatures/gsubContextRuleParser'
import type { LayoutLookupInventory } from 'src/lib/openTypeFeatures/layoutTableInventory'
import type {
  AlternateSubstitutionRule,
  FeatureDiagnostic,
  LigatureSubstitutionRule,
  MultipleSubstitutionRule,
  Rule,
  SingleSubstitutionRule,
  SourceProvenance,
} from 'src/lib/openTypeFeatures/types'

export interface GsubRuleParseResult {
  rules: Rule[]
  diagnostics: FeatureDiagnostic[]
  unsupportedReason?: string
}

const makeParserDiagnostic = (
  severity: FeatureDiagnostic['severity'],
  message: string,
  idPart: string,
  lookupId: string
): FeatureDiagnostic => ({
  id: `feature-diagnostic-${severity}-gsub-parser-${idPart}`,
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
) => `rule_gsub_${lookupIndex}_${subtableIndex}_${kind}_${ruleIndex}`

const makeProvenance = (
  lookup: LayoutLookupInventory,
  subtableIndex: number
): SourceProvenance => ({
  table: 'GSUB',
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

const parseSingleSubstitution = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): SingleSubstitutionRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  if (coverageOffset === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageGlyphNames = coverageGlyphIds
    ? resolveGlyphNames(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageGlyphIds || !coverageGlyphNames) return null

  const format = subtableReader.uint16(0)
  if (format === 1) {
    const deltaGlyphId = subtableReader.uint16(4)
    if (deltaGlyphId === null) return null

    const rules: SingleSubstitutionRule[] = []
    for (let index = 0; index < coverageGlyphIds.length; index += 1) {
      const replacement = glyphNameForId(
        glyphOrder,
        coverageGlyphIds[index] + toSignedInt16(deltaGlyphId)
      )
      if (!replacement) return null

      rules.push({
        id: makeRuleId(lookup.lookupIndex, subtableIndex, 'single', index),
        kind: 'singleSubstitution',
        target: { kind: 'glyph', glyph: coverageGlyphNames[index] },
        replacement,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
    return rules
  }

  if (format === 2) {
    const glyphCount = subtableReader.uint16(4)
    if (glyphCount === null || glyphCount !== coverageGlyphNames.length) {
      return null
    }

    const rules: SingleSubstitutionRule[] = []
    for (let index = 0; index < glyphCount; index += 1) {
      const substituteGlyphId = subtableReader.uint16(6 + index * 2)
      const replacement =
        substituteGlyphId === null
          ? null
          : glyphNameForId(glyphOrder, substituteGlyphId)
      if (!replacement) return null

      rules.push({
        id: makeRuleId(lookup.lookupIndex, subtableIndex, 'single', index),
        kind: 'singleSubstitution',
        target: { kind: 'glyph', glyph: coverageGlyphNames[index] },
        replacement,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
    }
    return rules
  }

  return null
}

const parseMultipleSubstitution = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): MultipleSubstitutionRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const sequenceCount = subtableReader.uint16(4)
  if (coverageOffset === null || sequenceCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageGlyphNames = coverageGlyphIds
    ? resolveGlyphNames(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageGlyphNames || coverageGlyphNames.length !== sequenceCount) {
    return null
  }

  const rules: MultipleSubstitutionRule[] = []
  for (let index = 0; index < sequenceCount; index += 1) {
    const sequenceOffset = subtableReader.uint16(6 + index * 2)
    const sequenceReader =
      sequenceOffset === null ? null : subtableReader.at(sequenceOffset)
    const glyphCount = sequenceReader?.uint16(0)
    if (!sequenceReader || glyphCount === null || glyphCount === undefined) {
      return null
    }

    const replacementGlyphIds: number[] = []
    for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex += 1) {
      const glyphId = sequenceReader.uint16(2 + glyphIndex * 2)
      if (glyphId === null) return null
      replacementGlyphIds.push(glyphId)
    }

    const replacement = resolveGlyphNames(glyphOrder, replacementGlyphIds)
    if (!replacement) return null

    rules.push({
      id: makeRuleId(lookup.lookupIndex, subtableIndex, 'multiple', index),
      kind: 'multipleSubstitution',
      target: coverageGlyphNames[index],
      replacement,
      meta: {
        origin: 'imported',
        provenance: makeProvenance(lookup, subtableIndex),
      },
    })
  }
  return rules
}

const parseAlternateSubstitution = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): AlternateSubstitutionRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const alternateSetCount = subtableReader.uint16(4)
  if (coverageOffset === null || alternateSetCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageGlyphNames = coverageGlyphIds
    ? resolveGlyphNames(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageGlyphNames || coverageGlyphNames.length !== alternateSetCount) {
    return null
  }

  const rules: AlternateSubstitutionRule[] = []
  for (let index = 0; index < alternateSetCount; index += 1) {
    const alternateSetOffset = subtableReader.uint16(6 + index * 2)
    const alternateSetReader =
      alternateSetOffset === null ? null : subtableReader.at(alternateSetOffset)
    const glyphCount = alternateSetReader?.uint16(0)
    if (
      !alternateSetReader ||
      glyphCount === null ||
      glyphCount === undefined
    ) {
      return null
    }

    const alternateGlyphIds: number[] = []
    for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex += 1) {
      const glyphId = alternateSetReader.uint16(2 + glyphIndex * 2)
      if (glyphId === null) return null
      alternateGlyphIds.push(glyphId)
    }

    const alternates = resolveGlyphNames(glyphOrder, alternateGlyphIds)
    if (!alternates) return null

    rules.push({
      id: makeRuleId(lookup.lookupIndex, subtableIndex, 'alternate', index),
      kind: 'alternateSubstitution',
      target: coverageGlyphNames[index],
      alternates,
      meta: {
        origin: 'imported',
        provenance: makeProvenance(lookup, subtableIndex),
      },
    })
  }
  return rules
}

const parseLigatureSubstitution = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): LigatureSubstitutionRule[] | null => {
  const coverageOffset = subtableReader.uint16(2)
  const ligatureSetCount = subtableReader.uint16(4)
  if (coverageOffset === null || ligatureSetCount === null) return null

  const coverageGlyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  const coverageGlyphNames = coverageGlyphIds
    ? resolveGlyphNames(glyphOrder, coverageGlyphIds)
    : null
  if (!coverageGlyphNames || coverageGlyphNames.length !== ligatureSetCount) {
    return null
  }

  const rules: LigatureSubstitutionRule[] = []
  for (let setIndex = 0; setIndex < ligatureSetCount; setIndex += 1) {
    const ligatureSetOffset = subtableReader.uint16(6 + setIndex * 2)
    const ligatureSetReader =
      ligatureSetOffset === null ? null : subtableReader.at(ligatureSetOffset)
    const ligatureCount = ligatureSetReader?.uint16(0)
    if (
      !ligatureSetReader ||
      ligatureCount === null ||
      ligatureCount === undefined
    ) {
      return null
    }

    for (
      let ligatureIndex = 0;
      ligatureIndex < ligatureCount;
      ligatureIndex += 1
    ) {
      const ligatureOffset = ligatureSetReader.uint16(2 + ligatureIndex * 2)
      const ligatureReader =
        ligatureOffset === null ? null : ligatureSetReader.at(ligatureOffset)
      const ligatureGlyphId = ligatureReader?.uint16(0)
      const componentCount = ligatureReader?.uint16(2)
      if (
        !ligatureReader ||
        ligatureGlyphId === null ||
        ligatureGlyphId === undefined ||
        componentCount === null ||
        componentCount === undefined
      ) {
        return null
      }

      const replacement = glyphNameForId(glyphOrder, ligatureGlyphId)
      if (!replacement || componentCount < 2) return null

      const trailingComponents: string[] = []
      for (
        let componentIndex = 1;
        componentIndex < componentCount;
        componentIndex += 1
      ) {
        const componentGlyphId = ligatureReader.uint16(
          4 + (componentIndex - 1) * 2
        )
        const component =
          componentGlyphId === null
            ? null
            : glyphNameForId(glyphOrder, componentGlyphId)
        if (!component) return null
        trailingComponents.push(component)
      }

      rules.push({
        id: makeRuleId(
          lookup.lookupIndex,
          subtableIndex,
          'ligature',
          rules.length
        ),
        kind: 'ligatureSubstitution',
        components: [coverageGlyphNames[setIndex], ...trailingComponents],
        replacement,
        meta: {
          origin: 'imported',
          provenance: makeProvenance(lookup, subtableIndex),
        },
      })
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

  if (lookup.lookupType === 7 && format === 1) {
    return parseExtensionSubstitution(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }

  if (lookup.lookupType === 1) {
    return parseSingleSubstitution(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }
  if (lookup.lookupType === 2 && format === 1) {
    return parseMultipleSubstitution(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }
  if (lookup.lookupType === 3 && format === 1) {
    return parseAlternateSubstitution(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }
  if (lookup.lookupType === 4 && format === 1) {
    return parseLigatureSubstitution(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }
  if (lookup.lookupType === 5 && format === 1) {
    return parseContextSubstitutionFormat1(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }
  if (lookup.lookupType === 6 && format === 1) {
    return parseChainingContextSubstitutionFormat1(
      subtableReader,
      glyphOrder,
      lookup,
      subtableIndex
    )
  }
  return null
}

const withExtensionProvenance = (
  rules: Rule[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): Rule[] =>
  rules.map((rule) => ({
    ...rule,
    meta: {
      ...rule.meta,
      provenance: makeProvenance(lookup, subtableIndex),
      reason: 'Reconstructed from a GSUB ExtensionSubst wrapper.',
    },
  }))

const parseExtensionSubstitution = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  lookup: LayoutLookupInventory,
  subtableIndex: number
): Rule[] | null => {
  const extensionLookupType = subtableReader.uint16(2)
  const extensionOffset = subtableReader.uint32(4)
  if (
    extensionLookupType === null ||
    extensionOffset === null ||
    extensionLookupType === 7
  ) {
    return null
  }

  const extensionReader = subtableReader.at(extensionOffset)
  const extensionFormat = extensionReader?.uint16(0)
  if (
    !extensionReader ||
    extensionFormat === null ||
    extensionFormat === undefined
  ) {
    return null
  }

  const delegatedLookup: LayoutLookupInventory = {
    ...lookup,
    lookupType: extensionLookupType,
    subtableFormats: [extensionFormat],
    subtableOffsets: [lookup.subtableOffsets[subtableIndex] + extensionOffset],
  }
  const rules = parseSupportedSubtable(
    extensionReader,
    glyphOrder,
    delegatedLookup,
    0
  )

  return rules ? withExtensionProvenance(rules, lookup, subtableIndex) : null
}

export const parseGsubLookupRules = (
  buffer: ArrayBuffer,
  tableOffset: number,
  lookup: LayoutLookupInventory,
  glyphOrder: string[],
  lookupId: string
): GsubRuleParseResult => {
  if (lookup.lookupType === 8) {
    return {
      rules: [],
      diagnostics: [],
      unsupportedReason:
        'GSUB ReverseChainingSingleSubst is preserved as unsupported because the current IR has no reverse-chaining replacement rule shape yet.',
    }
  }

  if (![1, 2, 3, 4, 5, 6, 7].includes(lookup.lookupType)) {
    return {
      rules: [],
      diagnostics: [],
      unsupportedReason: `GSUB lookup type ${lookup.lookupType} is not reconstructed into editable rules yet.`,
    }
  }

  const tableReader = new BinaryReader(buffer).at(tableOffset)
  if (!tableReader) {
    return {
      rules: [],
      diagnostics: [
        makeParserDiagnostic(
          'warning',
          'GSUB table could not be read for rule reconstruction.',
          `lookup-${lookup.lookupIndex}-table-unreadable`,
          lookupId
        ),
      ],
      unsupportedReason: 'GSUB table could not be read.',
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
          `GSUB lookup ${lookup.lookupIndex} subtable ${subtableIndex} could not be reconstructed as editable rules.`,
          `lookup-${lookup.lookupIndex}-subtable-${subtableIndex}-unsupported`,
          lookupId
        )
      )
      return {
        rules,
        diagnostics,
        unsupportedReason:
          'One or more GSUB subtables could not be reconstructed as editable rules.',
      }
    }

    rules.push(...parsedRules)
  }

  return { rules, diagnostics }
}
