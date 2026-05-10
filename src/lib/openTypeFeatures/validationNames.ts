export const isFourCharTag = (value: string) => value.length === 4

export const isValidLookupName = (value: string) =>
  /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)

export const isValidGlyphClassName = (value: string) =>
  /^@[A-Za-z_][A-Za-z0-9_.]*$/.test(value)

export const isValidGlyphName = (value: string) =>
  /^[A-Za-z_.][A-Za-z0-9_.-]*$/.test(value)
