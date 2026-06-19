import type { KumikoColor } from 'src/store'

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))

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
