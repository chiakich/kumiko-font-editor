const CSS_PX_PER_PT = 96 / 72

export type OverviewGridSizeUnit = 'px' | 'pt'

export interface OverviewGridZoomLayout {
  id: string
  cardMinWidth: number
  cardHeight: number
  previewHeight: number
  gap: number
  showGlyphName: boolean
}

export interface ParsedOverviewGridSizeInput {
  unit: OverviewGridSizeUnit
  value: number
}

export const DEFAULT_OVERVIEW_GRID_SIZE_PX = 120
export const MIN_OVERVIEW_GRID_SIZE_PX = 12
export const MAX_OVERVIEW_GRID_SIZE_PX = 280
export const OVERVIEW_GRID_SIZE_STEP_BY_UNIT: Record<
  OverviewGridSizeUnit,
  number
> = {
  px: 8,
  pt: 6,
}

const GLYPH_NAME_HIDE_THRESHOLD_PX = 112

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const clampOverviewGridSizePx = (value: number) =>
  clampNumber(value, MIN_OVERVIEW_GRID_SIZE_PX, MAX_OVERVIEW_GRID_SIZE_PX)

export const overviewGridSizeUnitToPx = (
  value: number,
  unit: OverviewGridSizeUnit
) => (unit === 'pt' ? value * CSS_PX_PER_PT : value)

export const overviewGridSizePxToUnit = (
  sizePx: number,
  unit: OverviewGridSizeUnit
) => (unit === 'pt' ? sizePx / CSS_PX_PER_PT : sizePx)

export const parseOverviewGridSizeInput = (
  value: string
): ParsedOverviewGridSizeInput | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const match = /^(\d+(?:\.\d+)?|\.\d+)\s*(px|pt)?$/i.exec(trimmed)
  if (!match) {
    return null
  }

  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return {
    unit: match[2]?.toLowerCase() === 'pt' ? 'pt' : 'px',
    value: parsed,
  }
}

export const formatOverviewGridSizeInput = (
  sizePx: number,
  unit: OverviewGridSizeUnit
) => {
  const value = overviewGridSizePxToUnit(sizePx, unit)
  const rounded = Math.round(value * 10) / 10
  const formattedValue = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1)
  return `${formattedValue} ${unit}`
}

export const buildOverviewGridZoomLayout = (
  inputSizePx: number
): OverviewGridZoomLayout => {
  const cardMinWidth = Math.round(clampOverviewGridSizePx(inputSizePx))
  const showGlyphName = cardMinWidth >= GLYPH_NAME_HIDE_THRESHOLD_PX
  const gap = Math.round(clampNumber(cardMinWidth / 20, 2, 18))
  const previewHeight = showGlyphName
    ? Math.max(88, Math.round(cardMinWidth * 0.9))
    : Math.max(12, cardMinWidth + 4)
  const cardHeight = showGlyphName ? previewHeight + 36 : previewHeight + 8

  return {
    id: `${cardMinWidth}-${showGlyphName ? 'named' : 'preview'}`,
    cardMinWidth,
    cardHeight,
    previewHeight,
    gap,
    showGlyphName,
  }
}
