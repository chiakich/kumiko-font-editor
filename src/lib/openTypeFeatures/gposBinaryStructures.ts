import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import type { AnchorPoint, GlyphClass } from 'src/lib/openTypeFeatures/types'

export const toSignedInt16 = (value: number) =>
  value > 0x7fff ? value - 0x10000 : value

export const glyphNameForId = (glyphOrder: string[], glyphId: number) =>
  glyphOrder[glyphId] ?? null

export const resolveGlyphNames = (
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

export const readCoverageGlyphNames = (
  subtableReader: BinaryReader,
  glyphOrder: string[],
  coverageOffset: number
) => {
  const glyphIds = readCoverageGlyphIds(subtableReader, coverageOffset)
  return glyphIds ? resolveGlyphNames(glyphOrder, glyphIds) : null
}

export const readAnchorPoint = (
  reader: BinaryReader,
  anchorOffset: number
): AnchorPoint | null => {
  if (anchorOffset === 0) return null

  const anchorReader = reader.at(anchorOffset)
  const format = anchorReader?.uint16(0)
  const x = anchorReader?.uint16(2)
  const y = anchorReader?.uint16(4)
  if (
    !anchorReader ||
    format === null ||
    format === undefined ||
    x === null ||
    x === undefined ||
    y === null ||
    y === undefined
  ) {
    return null
  }

  if (![1, 2, 3].includes(format)) return null
  return { x: toSignedInt16(x), y: toSignedInt16(y) }
}

export const readClassDefGlyphIds = (
  reader: BinaryReader,
  classDefOffset: number
): Map<number, number[]> | null => {
  const classDefReader = reader.at(classDefOffset)
  const format = classDefReader?.uint16(0)
  if (!classDefReader || format === null || format === undefined) return null

  const classes = new Map<number, number[]>()
  const addGlyph = (classId: number, glyphId: number) => {
    const glyphIds = classes.get(classId) ?? []
    glyphIds.push(glyphId)
    classes.set(classId, glyphIds)
  }

  if (format === 1) {
    const startGlyphId = classDefReader.uint16(2)
    const glyphCount = classDefReader.uint16(4)
    if (startGlyphId === null || glyphCount === null) return null

    for (let index = 0; index < glyphCount; index += 1) {
      const classId = classDefReader.uint16(6 + index * 2)
      if (classId === null) return null
      addGlyph(classId, startGlyphId + index)
    }
    return classes
  }

  if (format === 2) {
    const rangeCount = classDefReader.uint16(2)
    if (rangeCount === null) return null

    for (let index = 0; index < rangeCount; index += 1) {
      const rangeOffset = 4 + index * 6
      const startGlyphId = classDefReader.uint16(rangeOffset)
      const endGlyphId = classDefReader.uint16(rangeOffset + 2)
      const classId = classDefReader.uint16(rangeOffset + 4)
      if (startGlyphId === null || endGlyphId === null || classId === null) {
        return null
      }

      for (let glyphId = startGlyphId; glyphId <= endGlyphId; glyphId += 1) {
        addGlyph(classId, glyphId)
      }
    }
    return classes
  }

  return null
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
