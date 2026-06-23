import type { FontAxis, FontSource } from 'src/store'

export interface AxisSourceMarker {
  value: number
  sourceIds: string[]
  sourceNames: string[]
}

export const clampAxisValue = (axis: FontAxis, value: number) =>
  Math.min(axis.maxValue, Math.max(axis.minValue, value))

export const getAxisValue = (
  axis: FontAxis,
  location: Record<string, number>
) => clampAxisValue(axis, location[axis.name] ?? axis.defaultValue)

export const getAxisPercent = (axis: FontAxis, value: number) => {
  const range = axis.maxValue - axis.minValue
  if (range === 0) {
    return 0
  }
  return ((clampAxisValue(axis, value) - axis.minValue) / range) * 100
}

export const getAxisStep = (axis: FontAxis) =>
  Math.abs(axis.maxValue - axis.minValue) <= 1 ? 0.01 : 1

const trimFixed = (value: number, digits: number) =>
  value
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')

export const formatAxisDisplayValue = (axis: FontAxis, value: number) => {
  const step = getAxisStep(axis)
  const roundedToStep = Math.round(value / step) * step
  const displayValue =
    Math.abs(value - roundedToStep) <= Math.max(1e-6, step * 0.1)
      ? roundedToStep
      : value
  if (Number.isInteger(displayValue)) {
    return String(displayValue)
  }
  return trimFixed(displayValue, 2)
}

export const getAxisSnapTolerance = (axis: FontAxis) => {
  const range = Math.abs(axis.maxValue - axis.minValue)
  if (range === 0) {
    return 0
  }
  return Math.max(getAxisStep(axis) * 2, range * 0.015)
}

export const getAxisSourceMarkers = (
  axis: FontAxis,
  sources: Record<string, FontSource> | null | undefined
): AxisSourceMarker[] => {
  const markersByValue = new Map<string, AxisSourceMarker>()

  for (const source of Object.values(sources ?? {})) {
    const value = getAxisValue(axis, source.location)
    const key = value.toFixed(6)
    const marker = markersByValue.get(key)
    if (marker) {
      marker.sourceIds.push(source.id)
      marker.sourceNames.push(source.name)
      continue
    }
    markersByValue.set(key, {
      value,
      sourceIds: [source.id],
      sourceNames: [source.name],
    })
  }

  return [...markersByValue.values()].sort((left, right) => {
    const valueDelta = left.value - right.value
    return valueDelta || left.sourceNames[0].localeCompare(right.sourceNames[0])
  })
}

export const isAxisMarkerActive = (
  axis: FontAxis,
  markerValue: number,
  currentValue: number
) => Math.abs(markerValue - currentValue) <= getAxisSnapTolerance(axis)

export const snapAxisValue = (
  axis: FontAxis,
  value: number,
  markers: AxisSourceMarker[]
) => {
  const clampedValue = clampAxisValue(axis, value)
  const tolerance = getAxisSnapTolerance(axis)
  let nearest: AxisSourceMarker | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const marker of markers) {
    const distance = Math.abs(marker.value - clampedValue)
    if (distance < nearestDistance) {
      nearest = marker
      nearestDistance = distance
    }
  }

  return nearest && nearestDistance <= tolerance ? nearest.value : clampedValue
}

const getSourceSnapCandidate = (
  axes: FontAxis[],
  sources: Record<string, FontSource> | null | undefined,
  location: Record<string, number>
) => {
  let nearestSource: FontSource | null = null
  let nearestScore = Number.POSITIVE_INFINITY

  for (const source of Object.values(sources ?? {})) {
    let score = 0
    let isWithinTolerance = true
    for (const axis of axes) {
      const tolerance = getAxisSnapTolerance(axis)
      const distance = Math.abs(
        getAxisValue(axis, location) - getAxisValue(axis, source.location)
      )
      if (distance > tolerance) {
        isWithinTolerance = false
        break
      }
      score += tolerance > 0 ? distance / tolerance : 0
    }
    if (isWithinTolerance && score < nearestScore) {
      nearestScore = score
      nearestSource = source
    }
  }

  return nearestSource
}

export const snapDesignspaceLocation = ({
  axes,
  axis,
  location,
  sources,
  value,
}: {
  axes: FontAxis[]
  axis: FontAxis
  location: Record<string, number>
  sources: Record<string, FontSource> | null | undefined
  value: number
}) => {
  const axisMarkers = getAxisSourceMarkers(axis, sources)
  const nextLocation = {
    ...location,
    [axis.name]: snapAxisValue(axis, value, axisMarkers),
  }
  const sourceSnap = getSourceSnapCandidate(axes, sources, nextLocation)
  if (!sourceSnap) {
    return nextLocation
  }

  return axes.reduce(
    (snappedLocation, currentAxis) => ({
      ...snappedLocation,
      [currentAxis.name]: getAxisValue(currentAxis, sourceSnap.location),
    }),
    { ...nextLocation }
  )
}
