import type {
  DevelopmentStatusDefinition,
  FontAxes,
  FontData,
  FontExportInstance,
  FontInfo,
  FontInfoCustomDataValue,
  FontProjectSettings,
  FontSource,
} from 'src/store'

export const KUMIKO_AXES_LIB_KEY = 'com.kumiko.fontEditor.axes'
export const KUMIKO_SOURCES_LIB_KEY = 'com.kumiko.fontEditor.sources'
export const KUMIKO_EXPORT_INSTANCES_LIB_KEY =
  'com.kumiko.fontEditor.exportInstances'
export const KUMIKO_SETTINGS_LIB_KEY = 'com.kumiko.fontEditor.settings'
export const KUMIKO_NOTES_LIB_KEY = 'com.kumiko.fontEditor.notes'
export const KUMIKO_OPENTYPE_NAME_RECORDS_LIB_KEY =
  'com.kumiko.fontEditor.openTypeNameRecords'
export const KUMIKO_LOCALIZED_NAMES_LIB_KEY =
  'com.kumiko.fontEditor.localizedNames'
export const FONTRA_STATUS_DEFINITIONS_KEY =
  'fontra.sourceStatusFieldDefinitions'

export type FontInfoGeneralKey = Exclude<
  keyof FontInfo,
  'customData' | 'localizedNames' | 'openTypeNameRecords'
>

export interface FontInfoGeneralField {
  key: FontInfoGeneralKey
  label: string
  type: 'text' | 'number'
  min?: number
  width?: string
}

export interface OpenTypeFontInfoSetting {
  key: string
  label: string
  type: 'text' | 'number' | 'array'
  defaultValue: FontInfoCustomDataValue
  min?: number
  max?: number
  length?: number
  description: string
}

export const generalFontInfoFields: FontInfoGeneralField[] = [
  { key: 'familyName', label: 'Family name', type: 'text' },
  { key: 'copyright', label: 'Copyright', type: 'text' },
  { key: 'trademark', label: 'Trademark', type: 'text' },
  { key: 'description', label: 'Description', type: 'text' },
  { key: 'sampleText', label: 'Sample text', type: 'text' },
  { key: 'designer', label: 'Designer', type: 'text' },
  { key: 'designerURL', label: 'Designer URL', type: 'text' },
  { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
  { key: 'manufacturerURL', label: 'Manufacturer URL', type: 'text' },
  {
    key: 'licenseDescription',
    label: 'License description',
    type: 'text',
  },
  { key: 'licenseInfoURL', label: 'License info URL', type: 'text' },
  { key: 'vendorID', label: 'Vendor ID', type: 'text', width: '5rem' },
  { key: 'versionMajor', label: 'Version Major', type: 'number', min: 0 },
  { key: 'versionMinor', label: 'Version Minor', type: 'number', min: 0 },
]

export const openTypeFontInfoSettings: OpenTypeFontInfoSetting[] = [
  {
    key: 'openTypeNameUniqueID',
    label: 'OpenType name unique ID',
    type: 'text',
    defaultValue: 'Unique ID Name ID 3',
    description:
      'Unique ID string. Corresponds to the OpenType name table name ID 3.',
  },
  {
    key: 'openTypeHeadCreated',
    label: 'OpenType head created',
    type: 'text',
    defaultValue: '',
    description: 'Creation date in UTC using the format YYYY/MM/DD HH:MM:SS.',
  },
  {
    key: 'openTypeNameVersion',
    label: 'OpenType name version',
    type: 'text',
    defaultValue: 'Version 1.0',
    description:
      'Version string. Corresponds to the OpenType name table name ID 5.',
  },
  {
    key: 'openTypeNamePreferredFamilyName',
    label: 'Preferred family name',
    type: 'text',
    defaultValue: 'Family Name',
    description:
      'Preferred family name. Corresponds to the OpenType name table name ID 16.',
  },
  {
    key: 'openTypeNameWWSFamilyName',
    label: 'WWS family name',
    type: 'text',
    defaultValue: 'Family Name',
    description:
      'WWS family name. Corresponds to the OpenType name table name ID 21.',
  },
  {
    key: 'openTypeOS2CodePageRanges',
    label: 'OS/2 code page ranges',
    type: 'array',
    defaultValue: [],
    description:
      'Bit numbers indicating code page ranges supported by the font.',
  },
  {
    key: 'openTypeOS2UnicodeRanges',
    label: 'OS/2 Unicode ranges',
    type: 'array',
    defaultValue: [],
    description: 'Bit numbers indicating Unicode ranges supported by the font.',
  },
  {
    key: 'postscriptWindowsCharacterSet',
    label: 'PostScript Windows character set',
    type: 'number',
    defaultValue: 2,
    min: 1,
    max: 20,
    description: 'Windows character set value from 1 to 20. Default is 2.',
  },
  {
    key: 'openTypeOS2Type',
    label: 'OS/2 embedding type',
    type: 'array',
    defaultValue: [3],
    description:
      'Embedding type bits for OS/2 fsType. Default [3] means editable embedding.',
  },
  {
    key: 'openTypeOS2Selection',
    label: 'OS/2 selection',
    type: 'array',
    defaultValue: [],
    description:
      'Bit numbers for OS/2 fsSelection. Bits 0, 5, and 6 should come from style mapping.',
  },
  {
    key: 'openTypeOS2WeightClass',
    label: 'OS/2 weight class',
    type: 'number',
    defaultValue: 400,
    min: 1,
    max: 1000,
    description: 'Weight class value from 1 to 1000.',
  },
  {
    key: 'openTypeOS2WidthClass',
    label: 'OS/2 width class',
    type: 'number',
    defaultValue: 5,
    min: 1,
    max: 9,
    description: 'Width class value from 1 to 9.',
  },
  {
    key: 'openTypeOS2FamilyClass',
    label: 'OS/2 family class',
    type: 'array',
    defaultValue: [8, 0],
    length: 2,
    description:
      'Two integers for IBM font class and subclass. Fontra defaults to [8, 0].',
  },
  {
    key: 'openTypeOS2Panose',
    label: 'OS/2 Panose',
    type: 'array',
    defaultValue: [2, 11, 5, 2, 4, 5, 4, 2, 2, 4],
    length: 10,
    description:
      'Ten non-negative integers for Panose categories. Fontra defaults to a sans-serif profile.',
  },
]

export const fontInfoUfoNameMap: Record<FontInfoGeneralKey, string> = {
  familyName: 'familyName',
  versionMajor: 'versionMajor',
  versionMinor: 'versionMinor',
  copyright: 'copyright',
  trademark: 'trademark',
  description: 'openTypeNameDescription',
  sampleText: 'openTypeNameSampleText',
  designer: 'openTypeNameDesigner',
  designerURL: 'openTypeNameDesignerURL',
  manufacturer: 'openTypeNameManufacturer',
  manufacturerURL: 'openTypeNameManufacturerURL',
  licenseDescription: 'openTypeNameLicense',
  licenseInfoURL: 'openTypeNameLicenseURL',
  vendorID: 'openTypeOS2VendorID',
}

const getCustomDataValue = (value: unknown): FontInfoCustomDataValue => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'number')) {
    return value
  }

  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value
  }

  return null
}

export const fontInfoFromUfoFontInfo = (
  ufoFontInfo: Record<string, unknown> | null | undefined
): FontInfo | undefined => {
  if (!ufoFontInfo) {
    return undefined
  }

  const fontInfo: FontInfo = { customData: {} }
  for (const field of generalFontInfoFields) {
    const value = ufoFontInfo[fontInfoUfoNameMap[field.key]]
    if (field.type === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        ;(fontInfo as unknown as Record<string, unknown>)[field.key] = value
      }
    } else if (typeof value === 'string' && value) {
      ;(fontInfo as unknown as Record<string, unknown>)[field.key] = value
    }
  }

  for (const setting of openTypeFontInfoSettings) {
    if (setting.key in ufoFontInfo) {
      fontInfo.customData[setting.key] = getCustomDataValue(
        ufoFontInfo[setting.key]
      )
    }
  }

  const nameRecords = ufoFontInfo[KUMIKO_OPENTYPE_NAME_RECORDS_LIB_KEY]
  if (nameRecords && typeof nameRecords === 'object') {
    fontInfo.openTypeNameRecords =
      nameRecords as FontInfo['openTypeNameRecords']
  }

  return fontInfo
}

export const fontInfoToUfoFontInfo = (
  fontInfo: FontInfo | undefined,
  fallbackFamilyName: string,
  unitsPerEm: number
) => {
  const ufoFontInfo: Record<string, unknown> = {
    familyName: fontInfo?.familyName || fallbackFamilyName,
    styleName: 'Regular',
    unitsPerEm,
  }

  for (const field of generalFontInfoFields) {
    const value = fontInfo?.[field.key]
    if (value !== undefined && value !== null && value !== '') {
      ufoFontInfo[fontInfoUfoNameMap[field.key]] = value
    }
  }

  for (const setting of openTypeFontInfoSettings) {
    const value = fontInfo?.customData?.[setting.key]
    if (value !== undefined && value !== null && value !== '') {
      ufoFontInfo[setting.key] = value
    }
  }
  if (fontInfo?.openTypeNameRecords) {
    ufoFontInfo[KUMIKO_OPENTYPE_NAME_RECORDS_LIB_KEY] =
      fontInfo.openTypeNameRecords
  }

  return ufoFontInfo
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const asNumberLocation = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      isFiniteNumber(entry[1])
    )
  )
}

const asNumberArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const numbers = value.filter(isFiniteNumber)
  return numbers.length > 0 ? numbers : undefined
}

const asAxisMapping = (value: unknown): Array<[number, number]> | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const mapping = value.flatMap((entry) =>
    Array.isArray(entry) &&
    entry.length >= 2 &&
    isFiniteNumber(entry[0]) &&
    isFiniteNumber(entry[1])
      ? ([[entry[0], entry[1]]] as Array<[number, number]>)
      : []
  )
  return mapping.length > 0 ? mapping : undefined
}

export const defaultFontAxes: FontAxes = {
  axes: [],
  mappings: [],
}

export const defaultFontSource = (
  id: string,
  name: string,
  fontData: Pick<FontData, 'lineMetricsHorizontalLayout'> = {}
): FontSource => ({
  id,
  name,
  location: {},
  italicAngle: 0,
  lineMetricsHorizontalLayout: fontData.lineMetricsHorizontalLayout ?? {
    ascender: { value: 800 },
    descender: { value: -200 },
    xHeight: { value: 500 },
    capHeight: { value: 700 },
  },
  customData: {},
})

export const fontAxesFromLib = (
  lib: Record<string, unknown> | null | undefined
): FontAxes | undefined => {
  const axesValue = lib?.[KUMIKO_AXES_LIB_KEY]
  if (!isRecord(axesValue)) {
    return undefined
  }

  const axes = Array.isArray(axesValue.axes)
    ? axesValue.axes.filter(isRecord).map((axis) => ({
        name: String(axis.name ?? ''),
        label: String(axis.label ?? axis.name ?? ''),
        tag: String(axis.tag ?? ''),
        minValue: isFiniteNumber(axis.minValue) ? axis.minValue : 0,
        defaultValue: isFiniteNumber(axis.defaultValue) ? axis.defaultValue : 0,
        maxValue: isFiniteNumber(axis.maxValue) ? axis.maxValue : 100,
        hidden: Boolean(axis.hidden),
        ...(asNumberArray(axis.values)
          ? { values: asNumberArray(axis.values) }
          : {}),
        ...(asAxisMapping(axis.mapping)
          ? { mapping: asAxisMapping(axis.mapping) }
          : {}),
        customData: isRecord(axis.customData) ? axis.customData : {},
      }))
    : []

  const mappings = Array.isArray(axesValue.mappings)
    ? axesValue.mappings.filter(isRecord).map((mapping) => ({
        description:
          typeof mapping.description === 'string'
            ? mapping.description
            : undefined,
        groupDescription:
          typeof mapping.groupDescription === 'string'
            ? mapping.groupDescription
            : undefined,
        inputLocation: asNumberLocation(mapping.inputLocation),
        outputLocation: asNumberLocation(mapping.outputLocation),
      }))
    : []

  return { axes, mappings }
}

export const fontSourcesFromLib = (
  lib: Record<string, unknown> | null | undefined
): Record<string, FontSource> | undefined => {
  const sourcesValue = lib?.[KUMIKO_SOURCES_LIB_KEY]
  if (!isRecord(sourcesValue)) {
    return undefined
  }

  const entries = Object.entries(sourcesValue)
    .filter((entry): entry is [string, Record<string, unknown>] =>
      isRecord(entry[1])
    )
    .map(([id, source]) => [
      id,
      {
        id,
        name: String(source.name ?? id),
        location: asNumberLocation(source.location),
        italicAngle: isFiniteNumber(source.italicAngle)
          ? source.italicAngle
          : 0,
        lineMetricsHorizontalLayout: isRecord(
          source.lineMetricsHorizontalLayout
        )
          ? (source.lineMetricsHorizontalLayout as FontSource['lineMetricsHorizontalLayout'])
          : undefined,
        lineMetricsVerticalLayout: isRecord(source.lineMetricsVerticalLayout)
          ? (source.lineMetricsVerticalLayout as FontSource['lineMetricsVerticalLayout'])
          : undefined,
        customData: isRecord(source.customData) ? source.customData : {},
      },
    ])

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export const exportInstancesFromLib = (
  lib: Record<string, unknown> | null | undefined
): FontExportInstance[] | undefined => {
  const instancesValue = lib?.[KUMIKO_EXPORT_INSTANCES_LIB_KEY]
  if (!Array.isArray(instancesValue)) {
    return undefined
  }

  return instancesValue.filter(isRecord).map((instance, index) => ({
    id: String(instance.id ?? `instance-${index + 1}`),
    name: String(instance.name ?? `Instance ${index + 1}`),
    styleName: String(instance.styleName ?? 'Regular'),
    location: asNumberLocation(instance.location),
    export: instance.export !== false,
    fileName:
      typeof instance.fileName === 'string' ? instance.fileName : undefined,
    familyName:
      typeof instance.familyName === 'string' ? instance.familyName : undefined,
    weightClass: isFiniteNumber(instance.weightClass)
      ? instance.weightClass
      : undefined,
    widthClass: isFiniteNumber(instance.widthClass)
      ? instance.widthClass
      : undefined,
    isBold: instance.isBold === true ? true : undefined,
    isItalic: instance.isItalic === true ? true : undefined,
    italicAngle: isFiniteNumber(instance.italicAngle)
      ? instance.italicAngle
      : undefined,
    customData: isRecord(instance.customData) ? instance.customData : {},
  }))
}

export const statusDefinitionsFromLib = (
  lib: Record<string, unknown> | null | undefined
): DevelopmentStatusDefinition[] | undefined => {
  const statusValue = lib?.[FONTRA_STATUS_DEFINITIONS_KEY]
  if (!Array.isArray(statusValue)) {
    return undefined
  }

  return statusValue.filter(isRecord).map((status, index) => ({
    value: isFiniteNumber(status.value) ? status.value : index,
    label: String(status.label ?? `Status ${index}`),
    color:
      Array.isArray(status.color) &&
      status.color.length === 4 &&
      status.color.every(isFiniteNumber)
        ? (status.color as [number, number, number, number])
        : [1, 0, 0, 1],
    isDefault: Boolean(status.isDefault),
  }))
}

export const settingsFromLib = (
  lib: Record<string, unknown> | null | undefined,
  axes: FontAxes | undefined
): FontProjectSettings => {
  const settingsValue = lib?.[KUMIKO_SETTINGS_LIB_KEY]
  const settings = isRecord(settingsValue) ? settingsValue : {}
  return {
    fontType:
      settings.fontType === 'static' || settings.fontType === 'variable'
        ? settings.fontType
        : axes?.axes.length
          ? 'variable'
          : 'static',
    outlineType: settings.outlineType === 'quadratic' ? 'quadratic' : 'cubic',
    customParameters: isRecord(settings.customParameters)
      ? settings.customParameters
      : {},
    notes:
      typeof settings.notes === 'string'
        ? settings.notes
        : typeof lib?.[KUMIKO_NOTES_LIB_KEY] === 'string'
          ? lib[KUMIKO_NOTES_LIB_KEY]
          : '',
    supplementalText:
      typeof settings.supplementalText === 'string'
        ? settings.supplementalText
        : '',
  }
}

export const buildUfoLibFromFontData = (
  fontData: FontData,
  baseLib: Record<string, unknown> | null | undefined = {}
) => {
  // public.postscriptNames maps the working glyph name (the UFO glyph name,
  // = glyph.id) to its production name; only emit when they differ.
  const postscriptNames = Object.fromEntries(
    Object.values(fontData.glyphs)
      .filter((glyph) => glyph.production && glyph.production !== glyph.id)
      .map((glyph) => [glyph.id, glyph.production])
  )

  // Honor the intended glyph order, dropping ids with no glyph and appending
  // any glyph missing from glyphOrder so the list stays complete.
  const orderedIds = (fontData.glyphOrder ?? []).filter(
    (id) => id in fontData.glyphs
  )
  const seen = new Set(orderedIds)
  const glyphOrder = [
    ...orderedIds,
    ...Object.keys(fontData.glyphs).filter((id) => !seen.has(id)),
  ]

  return {
    ...(baseLib ?? {}),
    ...(fontData.axes ? { [KUMIKO_AXES_LIB_KEY]: fontData.axes } : {}),
    ...(fontData.sources ? { [KUMIKO_SOURCES_LIB_KEY]: fontData.sources } : {}),
    ...(fontData.exportInstances
      ? { [KUMIKO_EXPORT_INSTANCES_LIB_KEY]: fontData.exportInstances }
      : {}),
    ...(fontData.statusDefinitions
      ? { [FONTRA_STATUS_DEFINITIONS_KEY]: fontData.statusDefinitions }
      : {}),
    ...(fontData.settings
      ? {
          [KUMIKO_SETTINGS_LIB_KEY]: fontData.settings,
          [KUMIKO_NOTES_LIB_KEY]: fontData.settings.notes ?? '',
        }
      : {}),
    ...(fontData.fontInfo?.openTypeNameRecords
      ? {
          [KUMIKO_OPENTYPE_NAME_RECORDS_LIB_KEY]:
            fontData.fontInfo.openTypeNameRecords,
        }
      : {}),
    ...(fontData.fontInfo?.localizedNames
      ? { [KUMIKO_LOCALIZED_NAMES_LIB_KEY]: fontData.fontInfo.localizedNames }
      : {}),
    ...(Object.keys(postscriptNames).length > 0
      ? { 'public.postscriptNames': postscriptNames }
      : {}),
    'public.glyphOrder': glyphOrder,
  }
}
