import { describe, expect, it } from 'vitest'
import {
  clampOverviewGridSizePx,
  formatOverviewGridSizeInput,
  MIN_OVERVIEW_GRID_SIZE_PX,
  overviewGridSizeUnitToPx,
  parseOverviewGridSizeInput,
} from 'src/features/fontOverview/utils/overviewGridZoom'

describe('overview grid zoom', () => {
  it('parses bare numbers as px and explicit pt as pt', () => {
    expect(parseOverviewGridSizeInput('120')).toEqual({
      unit: 'px',
      value: 120,
    })
    expect(parseOverviewGridSizeInput('120px')).toEqual({
      unit: 'px',
      value: 120,
    })
    expect(parseOverviewGridSizeInput('120 pt')).toEqual({
      unit: 'pt',
      value: 120,
    })
    expect(parseOverviewGridSizeInput('120pt')).toEqual({
      unit: 'pt',
      value: 120,
    })
  })

  it('formats the parsed size with an explicit unit', () => {
    expect(formatOverviewGridSizeInput(120, 'px')).toBe('120 px')
    expect(formatOverviewGridSizeInput(160, 'pt')).toBe('120 pt')
  })

  it('allows overview cards down to 12px', () => {
    expect(MIN_OVERVIEW_GRID_SIZE_PX).toBe(12)
    expect(clampOverviewGridSizePx(4)).toBe(12)
    expect(clampOverviewGridSizePx(overviewGridSizeUnitToPx(6, 'pt'))).toBe(12)
  })
})
