export const normalizeUnicodeHex = (
  value: string | number | null | undefined
) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const raw =
    typeof value === 'number'
      ? value.toString(16)
      : value.trim().replace(/^U\+/i, '')
  if (!raw) {
    return null
  }
  const parsed = Number.parseInt(raw, 16)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed.toString(16).toUpperCase().padStart(4, '0')
}
