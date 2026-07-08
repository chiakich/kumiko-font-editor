import {
  BinaryReader,
  findSfntTable,
  readSfntTableDirectory,
} from 'src/lib/openTypeFeatures/binaryReader'

interface NameRecordCandidate {
  score: number
  text: string
}

const WINDOWS_UNICODE_BMP = 1
const WINDOWS_UNICODE_FULL = 10

const scoreNameRecord = (
  platformId: number,
  encodingId: number,
  languageId: number
) => {
  if (
    platformId === 3 &&
    (encodingId === WINDOWS_UNICODE_BMP || encodingId === WINDOWS_UNICODE_FULL)
  ) {
    return languageId === 0x409 ? 4 : 3
  }
  if (platformId === 0) return 2
  if (platformId === 1 && encodingId === 0) return 1
  return 0
}

const decodeUtf16Be = (bytes: Uint8Array) => {
  let text = ''
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
  }
  return text
}

const decodeMacRoman = (bytes: Uint8Array) => {
  let text = ''
  for (const byte of bytes) {
    // Non-ASCII Mac Roman needs a full mapping table; ASCII covers the
    // overwhelmingly common case for legacy Mac name records.
    text += byte < 0x80 ? String.fromCharCode(byte) : '�'
  }
  return text
}

/**
 * Reads the sfnt `name` table and returns the best available string per
 * name ID. Windows Unicode records (preferring US English) win over
 * Unicode-platform records, which win over Mac Roman records.
 */
export const parseNameTableStrings = (
  buffer: ArrayBuffer
): Map<number, string> => {
  const strings = new Map<number, string>()
  const directory = readSfntTableDirectory(buffer)
  const nameRecord = findSfntTable(directory, 'name')
  if (!nameRecord) return strings

  const reader = new BinaryReader(buffer).at(nameRecord.offset)
  const count = reader?.uint16(2)
  const stringOffset = reader?.uint16(4)
  if (
    !reader ||
    count === null ||
    count === undefined ||
    stringOffset === null ||
    stringOffset === undefined
  ) {
    return strings
  }

  const bestByNameId = new Map<number, NameRecordCandidate>()
  for (let index = 0; index < count; index += 1) {
    const recordOffset = 6 + index * 12
    const platformId = reader.uint16(recordOffset)
    const encodingId = reader.uint16(recordOffset + 2)
    const languageId = reader.uint16(recordOffset + 4)
    const nameId = reader.uint16(recordOffset + 6)
    const length = reader.uint16(recordOffset + 8)
    const offset = reader.uint16(recordOffset + 10)
    if (
      platformId === null ||
      encodingId === null ||
      languageId === null ||
      nameId === null ||
      length === null ||
      offset === null
    ) {
      continue
    }

    const score = scoreNameRecord(platformId, encodingId, languageId)
    if (score === 0) continue
    const existing = bestByNameId.get(nameId)
    if (existing && existing.score >= score) continue

    const stringReader = reader.at(stringOffset + offset)
    if (!stringReader?.hasRange(0, length)) continue
    const bytes = new Uint8Array(length)
    for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
      const byte = stringReader.uint8(byteIndex)
      if (byte === null) break
      bytes[byteIndex] = byte
    }

    const text = platformId === 1 ? decodeMacRoman(bytes) : decodeUtf16Be(bytes)
    if (text.length === 0) continue
    bestByNameId.set(nameId, { score, text })
  }

  for (const [nameId, candidate] of bestByNameId) {
    strings.set(nameId, candidate.text)
  }
  return strings
}
