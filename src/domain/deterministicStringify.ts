export const deterministicStringify = (value: unknown) => {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortValue)
    }

    if (input && typeof input === 'object') {
      return Object.keys(input as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((accumulator, key) => {
          accumulator[key] = sortValue((input as Record<string, unknown>)[key])
          return accumulator
        }, {})
    }

    return input
  }

  return JSON.stringify(sortValue(value), null, 2)
}
