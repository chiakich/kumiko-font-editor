import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures/types'

export interface SfntTableRecord {
  tag: string
  checksum: number
  offset: number
  length: number
}

export interface SfntTableDirectory {
  scalerType: string
  tables: SfntTableRecord[]
  diagnostics: FeatureDiagnostic[]
}

export class BinaryReader {
  private readonly view: DataView
  private readonly buffer: ArrayBuffer
  private readonly baseOffset: number

  constructor(buffer: ArrayBuffer, baseOffset = 0) {
    this.buffer = buffer
    this.baseOffset = baseOffset
    this.view = new DataView(buffer)
  }

  get length() {
    return this.buffer.byteLength
  }

  hasRange(offset: number, byteLength: number) {
    return (
      Number.isInteger(offset) &&
      Number.isInteger(byteLength) &&
      offset >= 0 &&
      byteLength >= 0 &&
      this.baseOffset + offset + byteLength <= this.length
    )
  }

  uint16(offset: number) {
    if (!this.hasRange(offset, 2)) return null
    return this.view.getUint16(this.baseOffset + offset, false)
  }

  uint32(offset: number) {
    if (!this.hasRange(offset, 4)) return null
    return this.view.getUint32(this.baseOffset + offset, false)
  }

  tag(offset: number) {
    if (!this.hasRange(offset, 4)) return null
    let value = ''
    for (let index = 0; index < 4; index += 1) {
      value += String.fromCharCode(
        this.view.getUint8(this.baseOffset + offset + index)
      )
    }
    return value
  }

  at(offset: number) {
    if (!this.hasRange(offset, 0)) return null
    return new BinaryReader(this.buffer, this.baseOffset + offset)
  }
}

const makeBinaryDiagnostic = (
  severity: FeatureDiagnostic['severity'],
  message: string,
  idPart: string
): FeatureDiagnostic => ({
  id: `feature-diagnostic-${severity}-binary-${idPart}`,
  severity,
  message,
  target: { kind: 'global' },
})

const normalizeScalerType = (tag: string | null) => {
  if (!tag) return 'unknown'
  if (tag === '\x00\x01\x00\x00') return 'TrueType'
  if (tag === 'OTTO') return 'CFF'
  return tag
}

export const readSfntTableDirectory = (
  buffer: ArrayBuffer
): SfntTableDirectory => {
  const reader = new BinaryReader(buffer)
  const diagnostics: FeatureDiagnostic[] = []
  const scalerType = normalizeScalerType(reader.tag(0))
  const numTables = reader.uint16(4)

  if (numTables === null) {
    return {
      scalerType,
      tables: [],
      diagnostics: [
        makeBinaryDiagnostic(
          'error',
          'Font binary is too small to contain an SFNT table directory.',
          'too-small'
        ),
      ],
    }
  }

  const directoryLength = 12 + numTables * 16
  if (!reader.hasRange(0, directoryLength)) {
    diagnostics.push(
      makeBinaryDiagnostic(
        'warning',
        'SFNT table directory is truncated; layout table inventory may be incomplete.',
        'truncated-directory'
      )
    )
  }

  const tables: SfntTableRecord[] = []
  for (let index = 0; index < numTables; index += 1) {
    const recordOffset = 12 + index * 16
    const tag = reader.tag(recordOffset)
    const checksum = reader.uint32(recordOffset + 4)
    const offset = reader.uint32(recordOffset + 8)
    const length = reader.uint32(recordOffset + 12)

    if (!tag || checksum === null || offset === null || length === null) {
      diagnostics.push(
        makeBinaryDiagnostic(
          'warning',
          `SFNT table record ${index} is truncated and was skipped.`,
          `record-${index}-truncated`
        )
      )
      continue
    }

    if (!reader.hasRange(offset, length)) {
      diagnostics.push(
        makeBinaryDiagnostic(
          'warning',
          `${tag.trim() || tag} table points outside the font binary and was skipped.`,
          `${tag.trim() || tag}-${index}-out-of-bounds`
        )
      )
      continue
    }

    tables.push({ tag, checksum, offset, length })
  }

  return { scalerType, tables, diagnostics }
}

export const findSfntTable = (directory: SfntTableDirectory, tag: string) =>
  directory.tables.find((table) => table.tag === tag) ?? null
