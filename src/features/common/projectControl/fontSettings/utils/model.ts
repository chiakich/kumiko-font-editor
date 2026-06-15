import {
  defaultFontAxes,
  defaultFontSource,
  generalFontInfoFields,
  openTypeFontInfoSettings,
  type FontInfoGeneralKey,
} from 'src/lib/fontFormats/fontInfoSettings'
import type {
  FontData,
  FontExportInstance,
  FontInfo,
  FontInfoCustomDataValue,
  FontProjectSettings,
  FontSource,
} from 'src/store'

export type FontInfoDraft = Record<FontInfoGeneralKey, string>
export type OpenTypeDraft = Record<string, string>
export type SourceDraft = FontSource & { locationText: string }
export type ExportDraft = FontExportInstance & { locationText: string }

export const toDraftValue = (value: unknown) =>
  value === undefined || value === null ? '' : String(value)

export const toArrayDraftValue = (value: unknown) =>
  Array.isArray(value) ? value.join(', ') : toDraftValue(value)

export const parseInteger = (value: string) => {
  if (!value.trim()) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const parseNumber = (value: string) => {
  if (!value.trim()) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseArrayValue = (value: string): number[] | string[] | undefined => {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return undefined
  const numbers = parts.map((part) => Number.parseInt(part, 10))
  return numbers.every(Number.isFinite) ? numbers : parts
}

export const stringifyJson = (value: unknown) =>
  JSON.stringify(value ?? {}, null, 2)

export const parseJsonRecord = (value: string): Record<string, unknown> => {
  if (!value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export const parseJsonArray = <T>(value: string): T[] => {
  try {
    const parsed = JSON.parse(value.trim() || '[]') as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export const parseLocation = (value: string): Record<string, number> =>
  Object.fromEntries(
    Object.entries(parseJsonRecord(value)).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  )

export const toFontInfoDraft = (
  fontInfo: FontInfo | undefined
): FontInfoDraft =>
  Object.fromEntries(
    generalFontInfoFields.map((field) => [
      field.key,
      toDraftValue(fontInfo?.[field.key]),
    ])
  ) as FontInfoDraft

export const toOpenTypeDraft = (
  fontInfo: FontInfo | undefined
): OpenTypeDraft =>
  Object.fromEntries(
    openTypeFontInfoSettings.map((setting) => [
      setting.key,
      toArrayDraftValue(fontInfo?.customData?.[setting.key]),
    ])
  )

export const toSourceDrafts = (fontData: FontData | null): SourceDraft[] =>
  Object.values(
    fontData?.sources ?? {
      default: defaultFontSource('default', 'Regular', {
        lineMetricsHorizontalLayout: fontData?.lineMetricsHorizontalLayout,
      }),
    }
  ).map((source) => ({
    ...source,
    locationText: stringifyJson(source.location),
  }))

export const toExportDrafts = (fontData: FontData | null): ExportDraft[] =>
  (fontData?.exportInstances ?? []).map((instance) => ({
    ...instance,
    locationText: stringifyJson(instance.location),
  }))

export const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const getInitialSettings = (
  fontData: FontData | null
): FontProjectSettings => ({
  fontType:
    fontData?.settings?.fontType ??
    ((fontData?.axes ?? defaultFontAxes).axes.length > 0
      ? 'variable'
      : 'static'),
  outlineType: fontData?.settings?.outlineType ?? 'cubic',
  customParameters: fontData?.settings?.customParameters ?? {},
  notes: fontData?.settings?.notes ?? '',
  supplementalText: fontData?.settings?.supplementalText ?? '',
})

export const buildFontInfoFromDrafts = (
  baseFontInfo: FontInfo | undefined,
  generalDraft: FontInfoDraft,
  openTypeDraft: OpenTypeDraft,
  localizedNames: Record<string, Record<string, string>>
): FontInfo => {
  const nextFontInfo: FontInfo = {
    localizedNames,
    openTypeNameRecords: baseFontInfo?.openTypeNameRecords,
    customData: { ...(baseFontInfo?.customData ?? {}) },
  }

  for (const field of generalFontInfoFields) {
    const value = generalDraft[field.key]
    if (field.type === 'number') {
      const parsed = parseInteger(value)
      if (parsed !== undefined) {
        ;(nextFontInfo as unknown as Record<string, unknown>)[field.key] =
          parsed
      }
    } else if (value.trim()) {
      ;(nextFontInfo as unknown as Record<string, unknown>)[field.key] =
        value.trim()
    }
  }

  for (const setting of openTypeFontInfoSettings) {
    const value = openTypeDraft[setting.key] ?? ''
    const parsed: FontInfoCustomDataValue | undefined =
      setting.type === 'number'
        ? parseInteger(value)
        : setting.type === 'array'
          ? parseArrayValue(value)
          : value.trim() || undefined

    if (parsed === undefined) {
      delete nextFontInfo.customData[setting.key]
    } else {
      nextFontInfo.customData[setting.key] = parsed
    }
  }

  return nextFontInfo
}
