// Geometry for the freehand vector brush. A brush stroke is stored as a
// closed outline, rather than a centreline with a visual stroke width, so it
// is immediately usable by the rest of the font editor and in exported fonts.

export interface BrushSample {
  x: number
  y: number
  pressure: number
}

export interface BrushPoint {
  x: number
  y: number
}

export type BrushStyle = 'round' | 'marker' | 'calligraphy'

export interface BrushSettings {
  size: number
  style: BrushStyle
  pressureEnabled: boolean
}

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 100,
  style: 'round',
  pressureEnabled: true,
}

export function normalizeBrushSettings(
  settings: Partial<BrushSettings>
): BrushSettings {
  return {
    size: Math.round(
      Math.min(240, Math.max(20, settings.size ?? DEFAULT_BRUSH_SETTINGS.size))
    ),
    style: settings.style ?? DEFAULT_BRUSH_SETTINGS.style,
    pressureEnabled:
      settings.pressureEnabled ?? DEFAULT_BRUSH_SETTINGS.pressureEnabled,
  }
}

const MIN_SAMPLE_DISTANCE = 4
const MIN_PRESSURE = 0.12

export function clampPressure(pressure: number | undefined): number {
  if (!Number.isFinite(pressure)) return 0.5
  return Math.min(1, Math.max(MIN_PRESSURE, pressure!))
}

// Keep samples evenly spaced in font units. Pointer events may arrive much
// farther apart when the browser is busy; interpolating here prevents gaps in
// the resulting outline. Nearby events update the current sample so a slow
// stylus still preserves its latest pressure.
export function appendBrushSample(
  samples: BrushSample[],
  sample: BrushSample,
  minimumDistance = MIN_SAMPLE_DISTANCE
): BrushSample[] {
  const next = { ...sample, pressure: clampPressure(sample.pressure) }
  const previous = samples.at(-1)
  if (!previous) return [next]

  const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
  if (distance < minimumDistance) {
    return [...samples.slice(0, -1), next]
  }

  const steps = Math.floor(distance / minimumDistance)
  const result = [...samples]
  for (let step = 1; step <= steps; step += 1) {
    const t = (step * minimumDistance) / distance
    if (t >= 1) break
    result.push({
      x: previous.x + (next.x - previous.x) * t,
      y: previous.y + (next.y - previous.y) * t,
      pressure: previous.pressure + (next.pressure - previous.pressure) * t,
    })
  }
  result.push(next)
  return result
}

export function smoothBrushSamples(samples: BrushSample[]): BrushSample[] {
  if (samples.length < 3) return samples
  return samples.map((sample, index) => {
    const from = Math.max(0, index - 1)
    const to = Math.min(samples.length - 1, index + 1)
    let total = 0
    let count = 0
    for (let neighbor = from; neighbor <= to; neighbor += 1) {
      total += samples[neighbor]!.pressure
      count += 1
    }
    return { ...sample, pressure: total / count }
  })
}

/**
 * Builds a round-capped outline from pressure samples. The left and right
 * rails use the centreline tangent at each sample, so pressure changes widen
 * the actual contour instead of merely changing a canvas line width.
 */
export function buildVectorBrushOutline(
  samples: BrushSample[],
  baseWidth: number,
  style: BrushStyle = 'round'
): BrushPoint[] {
  if (samples.length < 2 || baseWidth <= 0) return []

  const smoothed = smoothBrushSamples(samples)
  const left: BrushPoint[] = []
  const right: BrushPoint[] = []
  let lastTangent = { x: 1, y: 0 }

  for (let index = 0; index < smoothed.length; index += 1) {
    const sample = smoothed[index]!
    const before = smoothed[Math.max(0, index - 1)]!
    const after = smoothed[Math.min(smoothed.length - 1, index + 1)]!
    const tangent = normalized({ x: after.x - before.x, y: after.y - before.y })
    if (tangent.x !== 0 || tangent.y !== 0) lastTangent = tangent
    const normal =
      style === 'calligraphy'
        ? CALLIGRAPHY_NIB_NORMAL
        : { x: -lastTangent.y, y: lastTangent.x }
    // A low but non-zero width keeps light pen strokes visible and editable.
    const radius =
      (baseWidth / 2) * (0.2 + clampPressure(sample.pressure) * 0.8)
    left.push({
      x: sample.x + normal.x * radius,
      y: sample.y + normal.y * radius,
    })
    right.push({
      x: sample.x - normal.x * radius,
      y: sample.y - normal.y * radius,
    })
  }

  const end = smoothed.at(-1)!
  const start = smoothed[0]!
  const endNormalAngle = Math.atan2(
    left.at(-1)!.y - end.y,
    left.at(-1)!.x - end.x
  )
  const startNormalAngle = Math.atan2(
    right[0]!.y - start.y,
    right[0]!.x - start.x
  )
  const endRadius = distance(end, left.at(-1)!)
  const startRadius = distance(start, right[0]!)

  if (style !== 'round') {
    return [...left, ...right.reverse()]
  }

  return [
    ...left,
    ...roundCap(end, endRadius, endNormalAngle, -1),
    ...right.reverse(),
    ...roundCap(start, startRadius, startNormalAngle, -1),
  ]
}

function roundCap(
  center: BrushPoint,
  radius: number,
  initialAngle: number,
  direction: 1 | -1
): BrushPoint[] {
  // Two points make a round cap without producing an excessive number of
  // editable nodes.
  return [1 / 3, 2 / 3].map((fraction) => {
    const angle = initialAngle + direction * Math.PI * fraction
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }
  })
}

function normalized(point: BrushPoint): BrushPoint {
  const length = Math.hypot(point.x, point.y)
  return length === 0
    ? { x: 0, y: 0 }
    : { x: point.x / length, y: point.y / length }
}

function distance(a: BrushPoint, b: BrushPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// A fixed nib direction makes a broad-nib pen respond to the writing angle,
// instead of always remaining perpendicular to the movement direction.
const CALLIGRAPHY_NIB_NORMAL = normalized({
  x: Math.cos((60 * Math.PI) / 180),
  y: Math.sin((60 * Math.PI) / 180),
})
