import type { KumikoColor } from 'src/store'

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

export const GLYPHS_LABEL_COLORS: KumikoColor[] = [
  [0.9412, 0.7098, 0.6431, 1],
  [0.9961, 0.851, 0.6784, 1],
  [0.8588, 0.7922, 0.6863, 1],
  [0.9882, 0.9608, 0.6902, 1],
  [0.8667, 0.9804, 0.7647, 1],
  [0.6314, 0.8275, 0.651, 1],
  [0.6353, 0.8431, 0.9922, 1],
  [0.6, 0.6902, 0.9569, 1],
  [0.8, 0.6549, 0.9216, 1],
  [0.9922, 0.7451, 0.8706, 1],
  [0.902, 0.898, 0.902, 1],
  [0.698, 0.698, 0.698, 1],
]

export const GLYPHS_LABEL_COLOR_KEYS = [
  'red',
  'orange',
  'brown',
  'yellow',
  'lightGreen',
  'green',
  'lightBlue',
  'blue',
  'purple',
  'pink',
  'gray',
  'black',
] as const

export const parseUfoColor = (value: string | null | undefined) => {
  if (!value) {
    return null
  }
  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null
  }
  return parts.map(clampUnit) as KumikoColor
}

export const serializeUfoColor = (
  value: KumikoColor | null | undefined
): string | null => (value ? value.map((part) => `${part}`).join(',') : null)

export const parseGlyphsLabelColor = (value: unknown): KumikoColor | null => {
  const index =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN
  if (!Number.isInteger(index) || index < 0) {
    return null
  }
  return GLYPHS_LABEL_COLORS[index] ?? null
}

export const nearestGlyphsLabelColorIndex = (
  color: KumikoColor | null | undefined
) => {
  if (!color) {
    return null
  }
  let bestIndex = 0
  let bestDistance = Infinity
  GLYPHS_LABEL_COLORS.forEach((candidate, index) => {
    const distance = candidate.reduce((sum, value, channel) => {
      const delta = value - color[channel]
      return sum + delta * delta
    }, 0)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

export const areKumikoColorsEqual = (
  left: KumikoColor | null | undefined,
  right: KumikoColor | null | undefined
) => {
  if (!left && !right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return left.every((value, index) => value === right[index])
}

export const kumikoColorToCssRgba = (
  color: KumikoColor | null | undefined,
  alphaOverride?: number
) => {
  if (!color) {
    return 'transparent'
  }
  const [red, green, blue, alpha] = color
  const resolvedAlpha = alphaOverride ?? alpha
  return `rgba(${Math.round(clampUnit(red) * 255)}, ${Math.round(
    clampUnit(green) * 255
  )}, ${Math.round(clampUnit(blue) * 255)}, ${clampUnit(resolvedAlpha)})`
}
