import { describe, expect, it } from 'vitest'
import {
  formatAxisDisplayValue,
  getAxisPercent,
  getAxisSourceMarkers,
  snapAxisValue,
  snapDesignspaceLocation,
} from 'src/features/editor/canvas/workspace/utils/designspaceAxisSnapping'
import type { FontAxis, FontSource } from 'src/store'

const weightAxis: FontAxis = {
  name: 'Weight',
  label: 'Weight',
  tag: 'wght',
  minValue: 100,
  defaultValue: 400,
  maxValue: 900,
}

const widthAxis: FontAxis = {
  name: 'Width',
  label: 'Width',
  tag: 'wdth',
  minValue: 50,
  defaultValue: 100,
  maxValue: 200,
}

const sources: Record<string, FontSource> = {
  Light: {
    id: 'Light',
    name: 'Light',
    location: { Weight: 100, Width: 100 },
  },
  Regular: {
    id: 'Regular',
    name: 'Regular',
    location: { Weight: 400, Width: 100 },
  },
  Support: {
    id: 'Support',
    name: 'Support',
    location: { Weight: 700, Width: 75 },
  },
}

describe('designspace axis snapping', () => {
  it('builds sorted source markers for an axis', () => {
    const markers = getAxisSourceMarkers(weightAxis, sources)

    expect(markers.map((marker) => marker.value)).toEqual([100, 400, 700])
  })

  it('deduplicates sources that share an axis value', () => {
    const markers = getAxisSourceMarkers(widthAxis, sources)

    expect(markers.map((marker) => marker.value)).toEqual([75, 100])
    expect(markers.find((marker) => marker.value === 100)?.sourceIds).toEqual([
      'Light',
      'Regular',
    ])
  })

  it('snaps an axis value near a source marker', () => {
    const markers = getAxisSourceMarkers(weightAxis, sources)

    expect(snapAxisValue(weightAxis, 392, markers)).toBe(400)
    expect(snapAxisValue(weightAxis, 370, markers)).toBe(370)
  })

  it('snaps the full location when every axis is near a source node', () => {
    const snapped = snapDesignspaceLocation({
      axes: [weightAxis, widthAxis],
      axis: weightAxis,
      location: { Weight: 690, Width: 76 },
      sources,
      value: 690,
    })

    expect(snapped).toEqual({ Weight: 700, Width: 75 })
  })

  it('only snaps the changed axis when the full source node is not close', () => {
    const snapped = snapDesignspaceLocation({
      axes: [weightAxis, widthAxis],
      axis: weightAxis,
      location: { Weight: 690, Width: 150 },
      sources,
      value: 690,
    })

    expect(snapped).toEqual({ Weight: 700, Width: 150 })
  })

  it('maps axis values to track percentages', () => {
    expect(getAxisPercent(weightAxis, 100)).toBe(0)
    expect(getAxisPercent(weightAxis, 500)).toBe(50)
    expect(getAxisPercent(weightAxis, 900)).toBe(100)
  })

  it('formats near-step source values without exposing tiny decimals', () => {
    expect(formatAxisDisplayValue(weightAxis, 569.08)).toBe('569')
    expect(formatAxisDisplayValue(weightAxis, 569.25)).toBe('569.25')
    expect(formatAxisDisplayValue(widthAxis, 75)).toBe('75')
  })
})
