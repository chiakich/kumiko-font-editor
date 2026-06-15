import type { ValueRecord } from 'src/lib/openTypeFeatures'

export type ValueRecordField = keyof ValueRecord

export function updateValueRecordField(
  value: ValueRecord | undefined,
  field: ValueRecordField,
  text: string
): ValueRecord | undefined {
  const nextValue = { ...(value ?? {}) }
  const parsedValue = parseOptionalNumber(text)

  if (parsedValue === undefined) {
    delete nextValue[field]
  } else {
    nextValue[field] = parsedValue
  }

  return isEmptyValueRecord(nextValue) ? undefined : nextValue
}

export function getValueRecordFieldText(
  value: ValueRecord | undefined,
  field: ValueRecordField
) {
  return value?.[field]?.toString() ?? ''
}

function parseOptionalNumber(text: string) {
  const trimmedText = text.trim()
  if (trimmedText === '') return undefined

  const parsedValue = Number(trimmedText)
  return Number.isFinite(parsedValue) ? parsedValue : undefined
}

function isEmptyValueRecord(value: ValueRecord) {
  return Object.values(value).every((entry) => entry === undefined)
}
