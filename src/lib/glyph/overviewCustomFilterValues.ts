import { isEmptyGlyphToEdit } from '@/lib/glyph/glyphBlankness'
import { getGlyphComponentGlyphIds } from '@/domain/glyphGeometryState'
import {
  GLYPHS_LABEL_COLOR_KEYS,
  nearestGlyphsLabelColorIndex,
} from '@/lib/color/kumikoColor'
import { getGlyphUnicodes } from '@/lib/glyph/glyphUnicode'
import { unicodeHexToCharacter } from '@/lib/project/unicode'
import type { GlyphEditTimes } from '@/lib/glyph/glyphEditTimes'
import {
  getGlyphCategoryPath,
  getGlyphDisplayCharacter,
  getGlyphScriptLabel,
  matchesUnicodeProperty,
} from '@/lib/glyph/glyphCategories'
import { compact } from '@/lib/glyph/overviewSearch'
import type { OverviewCustomFilterRuleField } from '@/lib/glyph/overviewTypes'
import { activeLayer } from '@/domain/glyphLayer'
import type { GlyphData } from '@/domain'

const hasMetricsKeys = (glyph: GlyphData) =>
  Boolean(
    glyph.leftMetricsKey || glyph.rightMetricsKey || glyph.widthMetricsKey
  )

const getLayer = (glyph: GlyphData) => activeLayer(glyph)

const booleanString = (value: boolean) => (value ? 'true' : 'false')

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const hasRecordEntries = (value: unknown) =>
  Object.keys(asRecord(value)).length > 0

const getSourceFields = (value: unknown): Record<string, unknown> =>
  asRecord(asRecord(asRecord(value).glyphs).fields)

const sourceFieldStrings = (
  glyph: GlyphData,
  fieldNames: string[]
): string[] => {
  const customData = asRecord(glyph.customData)
  const sourceFields = getSourceFields(glyph.sourceData)

  return fieldNames.flatMap((fieldName) =>
    valueToStrings(customData[fieldName] ?? sourceFields[fieldName])
  )
}

const valueToStrings = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/u)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)]
  }
  if (Array.isArray(value)) {
    return value.flatMap(valueToStrings)
  }
  return []
}

const colorToStrings = (color: GlyphData['color']) => {
  if (!color) {
    return ['none', 'not set']
  }

  const colorIndex = nearestGlyphsLabelColorIndex(color)
  const colorKey =
    colorIndex === null ? null : GLYPHS_LABEL_COLOR_KEYS[colorIndex]
  const rgba = color.map((channel) =>
    Number.isInteger(channel)
      ? String(channel)
      : String(Number(channel.toFixed(3)))
  )
  const [r, g, b, a] = color
  const hex =
    r !== undefined &&
    g !== undefined &&
    b !== undefined &&
    [r, g, b].every((channel) => channel >= 0 && channel <= 1)
      ? `#${[r, g, b]
          .map((channel) =>
            Math.round(channel * 255)
              .toString(16)
              .padStart(2, '0')
          )
          .join('')}`
      : null

  return compact([
    colorKey,
    colorIndex === null ? null : String(colorIndex),
    rgba.join(','),
    `rgba(${rgba.join(', ')})`,
    hex,
    a === 0 ? 'not set' : null,
  ])
}

const getGlyphCase = (glyph: GlyphData) => {
  const explicitCase = sourceFieldStrings(glyph, ['case'])[0]
  if (explicitCase) {
    return explicitCase
  }

  const glyphName = glyph.name || glyph.id
  if (/(^|[._-])s(?:mall)?c(?:ap)?s?($|[._-])/iu.test(glyphName)) {
    return 'smallCap'
  }

  const character = getGlyphDisplayCharacter(glyph)
  if (matchesUnicodeProperty(character, /\p{Uppercase_Letter}/u)) {
    return 'uppercase'
  }
  if (matchesUnicodeProperty(character, /\p{Lowercase_Letter}/u)) {
    return 'lowercase'
  }
  return 'none'
}

const hasSpecialLayers = (glyph: GlyphData) =>
  Object.values(glyph.layers ?? {}).some(
    (layer) => layer.type === 'brace' || layer.type === 'bracket'
  )

const hasCustomGlyphInfo = (glyph: GlyphData) =>
  hasRecordEntries(glyph.customData) ||
  hasRecordEntries(getSourceFields(glyph.sourceData))

const hasAutoAlignedComponent = (glyph: GlyphData) =>
  getLayer(glyph).componentRefs.some(
    (component) => component.autoAlign !== false
  )

const hasCornerComponent = (glyph: GlyphData) =>
  getGlyphComponentGlyphIds(glyph).some((componentId) =>
    /(^|[._-])corner($|[._-])/iu.test(componentId)
  )

export const getOverviewCustomFilterRuleValues = (
  glyph: GlyphData,
  field: OverviewCustomFilterRuleField,
  glyphEditTimes: GlyphEditTimes
) => {
  const { category, subCategory } = getGlyphCategoryPath(glyph)
  const layer = getLayer(glyph)

  switch (field) {
    case 'glyphName':
      return compact([
        glyph.id,
        glyph.name,
        glyph.displayName,
        glyph.production,
      ])
    case 'unicode':
      return getGlyphUnicodes(glyph).flatMap((unicode) =>
        compact([unicode, `U+${unicode}`, unicodeHexToCharacter(unicode)])
      )
    case 'note':
      return compact([glyph.note])
    case 'pathCount':
      return [String(layer.paths.length)]
    case 'componentCount':
      return [String(layer.componentRefs.length)]
    case 'tags':
      return sourceFieldStrings(glyph, ['tags', 'tag'])
    case 'script':
      return compact([
        ...sourceFieldStrings(glyph, ['script']),
        getGlyphScriptLabel(glyph),
      ])
    case 'category':
      return [category]
    case 'subCategory':
      return compact([subCategory])
    case 'case':
      return [getGlyphCase(glyph)]
    case 'component':
      return getGlyphComponentGlyphIds(glyph)
    case 'export':
      return [booleanString(glyph.export !== false)]
    case 'empty':
      return [booleanString(isEmptyGlyphToEdit(glyph))]
    case 'edited':
      return [booleanString(Number.isFinite(glyphEditTimes[glyph.id]))]
    case 'hasUnicode':
      return [booleanString(getGlyphUnicodes(glyph).length > 0)]
    case 'hasComponents':
      return [booleanString(getGlyphComponentGlyphIds(glyph).length > 0)]
    case 'hasAnchors':
      return [booleanString(getLayer(glyph).anchors.length > 0)]
    case 'hasHints':
      return [booleanString((getLayer(glyph).hints ?? []).length > 0)]
    case 'hasCorners':
      return [booleanString(hasCornerComponent(glyph))]
    case 'hasSpecialLayers':
      return [booleanString(hasSpecialLayers(glyph))]
    case 'hasCustomGlyphInfo':
      return [booleanString(hasCustomGlyphInfo(glyph))]
    case 'isAutoAligned':
      return [booleanString(hasAutoAlignedComponent(glyph))]
    case 'hasMetricsKeys':
      return [booleanString(hasMetricsKeys(glyph))]
    case 'hasColorLabel':
      return [booleanString(Boolean(glyph.color))]
    case 'colorLabel':
      return colorToStrings(glyph.color)
    case 'hasLayerColorLabel':
      return [booleanString(Boolean(layer.color))]
    case 'layerColorLabel':
      return colorToStrings(layer.color)
  }
}
