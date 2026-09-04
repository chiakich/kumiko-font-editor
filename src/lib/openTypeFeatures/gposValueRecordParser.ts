import type { BinaryReader } from '@/lib/openTypeFeatures/binaryReader'
import { toSignedInt16 } from '@/lib/openTypeFeatures/gposBinaryStructures'
import type { ValueRecord } from '@/lib/openTypeFeatures/types'

interface ParsedValueRecord {
  value: ValueRecord
  byteLength: number
}

const VALUE_FORMAT_FIELDS: Array<keyof ValueRecord> = [
  'xPlacement',
  'yPlacement',
  'xAdvance',
  'yAdvance',
]

const VALUE_FORMAT_DEVICE_FIELD_START = VALUE_FORMAT_FIELDS.length
const VALUE_FORMAT_DEVICE_FIELD_END = 8
const SUPPORTED_VALUE_FORMAT_MASK = 0x00ff

export const readValueRecord = (
  reader: BinaryReader,
  offset: number,
  valueFormat: number
): ParsedValueRecord | null => {
  const value: ValueRecord = {}
  let cursor = offset

  for (let bitIndex = 0; bitIndex < VALUE_FORMAT_FIELDS.length; bitIndex += 1) {
    if (!(valueFormat & (1 << bitIndex))) continue

    const rawValue = reader.uint16(cursor)
    if (rawValue === null) return null

    value[VALUE_FORMAT_FIELDS[bitIndex]] = toSignedInt16(rawValue)
    cursor += 2
  }

  for (
    let bitIndex = VALUE_FORMAT_DEVICE_FIELD_START;
    bitIndex < VALUE_FORMAT_DEVICE_FIELD_END;
    bitIndex += 1
  ) {
    if (!(valueFormat & (1 << bitIndex))) continue
    if (reader.uint16(cursor) === null) return null
    cursor += 2
  }

  if (valueFormat & ~SUPPORTED_VALUE_FORMAT_MASK) {
    return null
  }

  return {
    value,
    byteLength: cursor - offset,
  }
}

export const isEmptyValue = (value: ValueRecord) =>
  (value.xPlacement === undefined || value.xPlacement === 0) &&
  (value.yPlacement === undefined || value.yPlacement === 0) &&
  (value.xAdvance === undefined || value.xAdvance === 0) &&
  (value.yAdvance === undefined || value.yAdvance === 0)
