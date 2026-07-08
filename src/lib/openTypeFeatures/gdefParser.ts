import { BinaryReader } from 'src/lib/openTypeFeatures/binaryReader'
import type {
  FeatureDiagnostic,
  GdefState,
  GlyphClass,
  LigatureCaret,
} from 'src/lib/openTypeFeatures/types'

interface GdefParseResult {
  gdef: GdefState
  diagnostics: FeatureDiagnostic[]
}

const GLYPH_CLASS_NAMES = {
  1: 'base',
  2: 'ligature',
  3: 'mark',
  4: 'component',
} as const

const makeGdefDiagnostic = (
  severity: FeatureDiagnostic['severity'],
  message: string,
  idPart: string
): FeatureDiagnostic => ({
  id: `feature-diagnostic-${severity}-gdef-parser-${idPart}`,
  severity,
  message,
  target: { kind: 'global' },
})

const glyphNameForId = (glyphOrder: string[], glyphId: number) =>
  glyphOrder[glyphId] ?? null

const pushClassGlyph = (
  classes: NonNullable<GdefState['glyphClasses']>,
  classValue: number,
  glyphName: string
) => {
  const className =
    GLYPH_CLASS_NAMES[classValue as keyof typeof GLYPH_CLASS_NAMES]
  if (!className) return
  classes[className] = [...(classes[className] ?? []), glyphName]
}

const readClassDefValues = (
  tableReader: BinaryReader,
  classDefOffset: number,
  glyphOrder: string[],
  diagnostics: FeatureDiagnostic[],
  idPrefix: string
): Map<number, string[]> | null => {
  const reader = tableReader.at(classDefOffset)
  const format = reader?.uint16(0)
  if (!reader || format === null || format === undefined) {
    diagnostics.push(
      makeGdefDiagnostic(
        'warning',
        'GDEF ClassDef table is malformed.',
        `${idPrefix}-malformed`
      )
    )
    return null
  }

  const glyphsByClassValue = new Map<number, string[]>()
  const pushGlyph = (classValue: number, glyphName: string) => {
    glyphsByClassValue.set(classValue, [
      ...(glyphsByClassValue.get(classValue) ?? []),
      glyphName,
    ])
  }

  if (format === 1) {
    const startGlyphId = reader.uint16(2)
    const glyphCount = reader.uint16(4)
    if (startGlyphId === null || glyphCount === null) return null

    for (let index = 0; index < glyphCount; index += 1) {
      const classValue = reader.uint16(6 + index * 2)
      const glyphName = glyphNameForId(glyphOrder, startGlyphId + index)
      if (classValue === null || !glyphName) return null
      pushGlyph(classValue, glyphName)
    }
    return glyphsByClassValue
  }

  if (format === 2) {
    const rangeCount = reader.uint16(2)
    if (rangeCount === null) return null

    for (let rangeIndex = 0; rangeIndex < rangeCount; rangeIndex += 1) {
      const rangeOffset = 4 + rangeIndex * 6
      const startGlyphId = reader.uint16(rangeOffset)
      const endGlyphId = reader.uint16(rangeOffset + 2)
      const classValue = reader.uint16(rangeOffset + 4)
      if (startGlyphId === null || endGlyphId === null || classValue === null)
        return null

      for (let glyphId = startGlyphId; glyphId <= endGlyphId; glyphId += 1) {
        const glyphName = glyphNameForId(glyphOrder, glyphId)
        if (!glyphName) return null
        pushGlyph(classValue, glyphName)
      }
    }
    return glyphsByClassValue
  }

  diagnostics.push(
    makeGdefDiagnostic(
      'warning',
      `GDEF ClassDef format ${format} is not supported yet.`,
      `${idPrefix}-format-${format}-unsupported`
    )
  )
  return null
}

const parseClassDef = (
  tableReader: BinaryReader,
  classDefOffset: number,
  glyphOrder: string[],
  diagnostics: FeatureDiagnostic[],
  idPrefix: string
) => {
  const glyphsByClassValue = readClassDefValues(
    tableReader,
    classDefOffset,
    glyphOrder,
    diagnostics,
    idPrefix
  )
  if (!glyphsByClassValue) return null

  const classes: NonNullable<GdefState['glyphClasses']> = {}
  for (const [classValue, glyphs] of glyphsByClassValue) {
    for (const glyphName of glyphs) {
      pushClassGlyph(classes, classValue, glyphName)
    }
  }
  return classes
}

const parseMarkAttachClassDef = (
  tableReader: BinaryReader,
  markAttachClassDefOffset: number,
  glyphOrder: string[],
  diagnostics: FeatureDiagnostic[]
): GlyphClass[] | null => {
  const glyphsByClassValue = readClassDefValues(
    tableReader,
    markAttachClassDefOffset,
    glyphOrder,
    diagnostics,
    'mark-attach-class-def'
  )
  if (!glyphsByClassValue) return null

  return [...glyphsByClassValue.entries()]
    .filter(([classValue]) => classValue > 0)
    .sort(([left], [right]) => left - right)
    .map(([classValue, glyphs]) => ({
      id: `gdef_mark_attach_class_${classValue}`,
      name: `@GDEFMarkAttachClass${classValue}`,
      glyphs,
      origin: 'imported',
    }))
}

const readCoverageGlyphs = (
  tableReader: BinaryReader,
  coverageOffset: number,
  glyphOrder: string[]
) => {
  const reader = tableReader.at(coverageOffset)
  const format = reader?.uint16(0)
  if (!reader || format === null || format === undefined) return null

  if (format === 1) {
    const glyphCount = reader.uint16(2)
    if (glyphCount === null) return null

    const glyphs: string[] = []
    for (let index = 0; index < glyphCount; index += 1) {
      const glyphId = reader.uint16(4 + index * 2)
      const glyphName =
        glyphId === null ? null : glyphNameForId(glyphOrder, glyphId)
      if (!glyphName) return null
      glyphs.push(glyphName)
    }
    return glyphs
  }

  if (format === 2) {
    const rangeCount = reader.uint16(2)
    if (rangeCount === null) return null

    const glyphs: string[] = []
    for (let rangeIndex = 0; rangeIndex < rangeCount; rangeIndex += 1) {
      const rangeOffset = 4 + rangeIndex * 6
      const startGlyphId = reader.uint16(rangeOffset)
      const endGlyphId = reader.uint16(rangeOffset + 2)
      if (startGlyphId === null || endGlyphId === null) return null

      for (let glyphId = startGlyphId; glyphId <= endGlyphId; glyphId += 1) {
        const glyphName = glyphNameForId(glyphOrder, glyphId)
        if (!glyphName) return null
        glyphs.push(glyphName)
      }
    }
    return glyphs
  }

  return null
}

const parseMarkGlyphSets = (
  tableReader: BinaryReader,
  markGlyphSetsOffset: number,
  glyphOrder: string[],
  diagnostics: FeatureDiagnostic[]
): GlyphClass[] | null => {
  const reader = tableReader.at(markGlyphSetsOffset)
  const format = reader?.uint16(0)
  const markSetCount = reader?.uint16(2)
  if (
    !reader ||
    format === null ||
    format === undefined ||
    markSetCount === null ||
    markSetCount === undefined
  ) {
    return null
  }

  if (format !== 1) {
    diagnostics.push(
      makeGdefDiagnostic(
        'warning',
        `GDEF MarkGlyphSets format ${format} is not supported yet.`,
        `mark-glyph-sets-format-${format}-unsupported`
      )
    )
    return null
  }

  const sets: GlyphClass[] = []
  for (let index = 0; index < markSetCount; index += 1) {
    const coverageOffset = reader.uint32(4 + index * 4)
    const glyphs =
      coverageOffset === null
        ? null
        : readCoverageGlyphs(reader, coverageOffset, glyphOrder)
    if (!glyphs) return null

    sets.push({
      id: `gdef_mark_glyph_set_${index}`,
      name: `@GDEFMarkGlyphSet${index}`,
      glyphs,
      origin: 'imported',
    })
  }
  return sets
}

const readCaretValue = (
  ligGlyphReader: BinaryReader,
  caretValueOffset: number,
  diagnostics: FeatureDiagnostic[],
  caretIndex: number
) => {
  const reader = ligGlyphReader.at(caretValueOffset)
  const format = reader?.uint16(0)
  if (!reader || format === null || format === undefined) return null

  if (format === 1 || format === 3) {
    const coordinate = reader.uint16(2)
    return coordinate === null
      ? null
      : {
          format: 'position' as const,
          value: coordinate > 0x7fff ? coordinate - 0x10000 : coordinate,
        }
  }

  if (format === 2) {
    const pointIndex = reader.uint16(2)
    return pointIndex === null
      ? null
      : { format: 'pointIndex' as const, value: pointIndex }
  }

  diagnostics.push(
    makeGdefDiagnostic(
      'info',
      `GDEF ligature caret ${caretIndex} uses unsupported caret value format ${format}.`,
      `ligature-caret-${caretIndex}-format-${format}-unsupported`
    )
  )
  return null
}

const parseLigatureCarets = (
  tableReader: BinaryReader,
  ligCaretListOffset: number,
  glyphOrder: string[],
  diagnostics: FeatureDiagnostic[]
): LigatureCaret[] | null => {
  const reader = tableReader.at(ligCaretListOffset)
  const coverageOffset = reader?.uint16(0)
  const ligGlyphCount = reader?.uint16(2)
  if (
    !reader ||
    coverageOffset === null ||
    coverageOffset === undefined ||
    ligGlyphCount === null ||
    ligGlyphCount === undefined
  ) {
    return null
  }

  const glyphs = readCoverageGlyphs(reader, coverageOffset, glyphOrder)
  if (!glyphs || glyphs.length !== ligGlyphCount) return null

  const carets: LigatureCaret[] = []
  for (let ligIndex = 0; ligIndex < ligGlyphCount; ligIndex += 1) {
    const ligGlyphOffset = reader.uint16(4 + ligIndex * 2)
    const ligGlyphReader =
      ligGlyphOffset === null ? null : reader.at(ligGlyphOffset)
    const caretCount = ligGlyphReader?.uint16(0)
    if (!ligGlyphReader || caretCount === null || caretCount === undefined) {
      return null
    }

    const positionCarets: number[] = []
    const pointIndexCarets: number[] = []
    for (let caretIndex = 0; caretIndex < caretCount; caretIndex += 1) {
      const caretValueOffset = ligGlyphReader.uint16(2 + caretIndex * 2)
      const caretValue =
        caretValueOffset === null
          ? null
          : readCaretValue(
              ligGlyphReader,
              caretValueOffset,
              diagnostics,
              caretIndex
            )
      if (caretValue?.format === 'pointIndex') {
        pointIndexCarets.push(caretValue.value)
      } else if (caretValue?.format === 'position') {
        positionCarets.push(caretValue.value)
      }
    }

    if (positionCarets.length > 0) {
      carets.push({ glyph: glyphs[ligIndex], carets: positionCarets })
    }
    if (pointIndexCarets.length > 0) {
      carets.push({
        glyph: glyphs[ligIndex],
        carets: pointIndexCarets,
        format: 'pointIndex',
      })
    }
  }
  return carets
}

export const parseGdefTable = (
  buffer: ArrayBuffer,
  tableOffset: number,
  glyphOrder: string[]
): GdefParseResult => {
  const reader = new BinaryReader(buffer).at(tableOffset)
  const diagnostics: FeatureDiagnostic[] = []
  if (!reader) {
    return {
      gdef: {},
      diagnostics: [
        makeGdefDiagnostic(
          'warning',
          'GDEF table could not be read.',
          'unreadable'
        ),
      ],
    }
  }

  const majorVersion = reader.uint16(0)
  const minorVersion = reader.uint16(2)
  const glyphClassDefOffset = reader.uint16(4)
  const ligCaretListOffset = reader.uint16(8)
  const markAttachClassDefOffset = reader.uint16(10)
  const markGlyphSetsOffset =
    majorVersion === 1 && minorVersion !== null && minorVersion >= 2
      ? reader.uint16(12)
      : null

  const gdef: GdefState = {}

  if (glyphClassDefOffset && glyphClassDefOffset > 0) {
    const glyphClasses = parseClassDef(
      reader,
      glyphClassDefOffset,
      glyphOrder,
      diagnostics,
      'glyph-class-def'
    )
    if (glyphClasses) gdef.glyphClasses = glyphClasses
  }

  if (markAttachClassDefOffset && markAttachClassDefOffset > 0) {
    const markAttachClasses = parseMarkAttachClassDef(
      reader,
      markAttachClassDefOffset,
      glyphOrder,
      diagnostics
    )
    if (markAttachClasses && markAttachClasses.length > 0) {
      gdef.markAttachClasses = markAttachClasses
    }
  }

  if (markGlyphSetsOffset && markGlyphSetsOffset > 0) {
    const markGlyphSets = parseMarkGlyphSets(
      reader,
      markGlyphSetsOffset,
      glyphOrder,
      diagnostics
    )
    if (markGlyphSets) gdef.markGlyphSets = markGlyphSets
  }

  if (ligCaretListOffset && ligCaretListOffset > 0) {
    const ligatureCarets = parseLigatureCarets(
      reader,
      ligCaretListOffset,
      glyphOrder,
      diagnostics
    )
    if (ligatureCarets) gdef.ligatureCarets = ligatureCarets
  }

  if (majorVersion !== 1 || minorVersion === null) {
    diagnostics.push(
      makeGdefDiagnostic(
        'warning',
        'GDEF header version is malformed or unsupported; only straightforward structures were imported.',
        'version-unsupported'
      )
    )
  }

  return { gdef, diagnostics }
}
