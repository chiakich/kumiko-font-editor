import {
  BinaryReader,
  findSfntTable,
  readSfntTableDirectory,
} from '@/lib/openTypeFeatures/binaryReader'
import type { LayoutFeatureInventory } from '@/lib/openTypeFeatures/layoutTableInventory'
import type {
  FeatureVariationCondition,
  FeatureVariationRecordSummary,
  FeatureVariationsSummary,
  FeatureVariationSubstitution,
} from '@/lib/openTypeFeatures/types'

const F2DOT14 = 16384

const toSignedF2Dot14 = (raw: number | null): number | null => {
  if (raw === null) {
    return null
  }
  const signed = raw >= 0x8000 ? raw - 0x10000 : raw
  return signed / F2DOT14
}

// fvar axis tags in axis-index order; FeatureVariations conditions refer to
// axes by index.
export const parseFvarAxisTags = (buffer: ArrayBuffer): string[] => {
  const directory = readSfntTableDirectory(buffer)
  const fvar = findSfntTable(directory, 'fvar')
  if (!fvar) {
    return []
  }
  const reader = new BinaryReader(buffer).at(fvar.offset)
  if (!reader) {
    return []
  }
  const axesArrayOffset = reader.uint16(4)
  const axisCount = reader.uint16(8)
  const axisSize = reader.uint16(10)
  if (!axesArrayOffset || !axisCount || !axisSize) {
    return []
  }
  const tags: string[] = []
  for (let index = 0; index < axisCount; index += 1) {
    const tag = reader.tag(axesArrayOffset + index * axisSize)
    if (!tag) {
      break
    }
    tags.push(tag)
  }
  return tags
}

export const parseFeatureVariations = (input: {
  buffer: ArrayBuffer
  table: 'GSUB' | 'GPOS'
  tableOffset: number
  featureVariationsOffset: number
  features: readonly LayoutFeatureInventory[]
  axisTags: readonly string[]
}): FeatureVariationsSummary | null => {
  const reader = new BinaryReader(input.buffer).at(
    input.tableOffset + input.featureVariationsOffset
  )
  if (!reader) {
    return null
  }
  const recordCount = reader.uint32(4)
  if (recordCount === null || recordCount === 0 || recordCount > 4096) {
    return null
  }
  const featureTagByIndex = new Map(
    input.features.map((feature) => [feature.featureIndex, feature.tag])
  )

  const records: FeatureVariationRecordSummary[] = []
  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = 8 + index * 8
    const conditionSetOffset = reader.uint32(recordOffset)
    const substitutionOffset = reader.uint32(recordOffset + 4)
    if (conditionSetOffset === null || substitutionOffset === null) {
      break
    }

    const conditions: FeatureVariationCondition[] = []
    if (conditionSetOffset > 0) {
      const conditionSet = reader.at(conditionSetOffset)
      const conditionCount = conditionSet?.uint16(0) ?? 0
      for (
        let conditionIndex = 0;
        conditionIndex < Math.min(conditionCount, 64);
        conditionIndex += 1
      ) {
        const conditionOffset = conditionSet?.uint32(2 + conditionIndex * 4)
        const condition =
          conditionOffset !== null && conditionOffset !== undefined
            ? conditionSet?.at(conditionOffset)
            : null
        if (!condition || condition.uint16(0) !== 1) {
          // Only format 1 (axis range) is defined today; skip the rest.
          continue
        }
        const axisIndex = condition.uint16(2)
        const min = toSignedF2Dot14(condition.uint16(4))
        const max = toSignedF2Dot14(condition.uint16(6))
        if (axisIndex === null || min === null || max === null) {
          continue
        }
        conditions.push({
          axisIndex,
          axisTag: input.axisTags[axisIndex] ?? null,
          min,
          max,
        })
      }
    }

    const substitutions: FeatureVariationSubstitution[] = []
    const substitutionTable = reader.at(substitutionOffset)
    const substitutionCount = substitutionTable?.uint16(4) ?? 0
    for (
      let substitutionIndex = 0;
      substitutionIndex < Math.min(substitutionCount, 512);
      substitutionIndex += 1
    ) {
      const entryOffset = 6 + substitutionIndex * 6
      const featureIndex = substitutionTable?.uint16(entryOffset)
      const alternateFeatureOffset = substitutionTable?.uint32(entryOffset + 2)
      if (
        featureIndex === null ||
        featureIndex === undefined ||
        alternateFeatureOffset === null ||
        alternateFeatureOffset === undefined
      ) {
        continue
      }
      const alternateFeature = substitutionTable?.at(alternateFeatureOffset)
      substitutions.push({
        featureIndex,
        featureTag: featureTagByIndex.get(featureIndex) ?? null,
        alternateLookupCount: alternateFeature?.uint16(2) ?? 0,
      })
    }

    records.push({ conditions, substitutions })
  }

  return records.length > 0 ? { table: input.table, records } : null
}
