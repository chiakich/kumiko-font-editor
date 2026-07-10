export interface ReferenceStylePair {
  reference: number
  current: number
  confidence: number
}

export interface ReferenceStyleModel {
  scale: number
  error: number
}

const MIN_SAMPLES = 100
const MIN_REFERENCE_MAGNITUDE = 0.005
const MAX_SCALE = 1.5
const MAD_TO_SIGMA = 1.4826

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const robustScale = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }
  const center = median(values)
  return median(values.map((value) => Math.abs(value - center))) * MAD_TO_SIGMA
}

/**
 * 通過原點的 Huber robust regression：reference residual 為 0 時，
 * current residual 的期待也必須是 0；少量畫壞字不應拉動整套風格係數。
 */
export const fitReferenceStyleModel = (
  pairs: ReferenceStylePair[]
): ReferenceStyleModel => {
  const usable = pairs.filter(
    (pair) =>
      Math.abs(pair.reference) >= MIN_REFERENCE_MAGNITUDE && pair.confidence > 0
  )
  if (usable.length < MIN_SAMPLES) {
    return { scale: 1, error: 0 }
  }

  const fit = (weights?: number[]) => {
    let numerator = 0
    let denominator = 0
    for (let index = 0; index < usable.length; index += 1) {
      const pair = usable[index]
      const weight = pair.confidence * (weights?.[index] ?? 1)
      numerator += weight * pair.reference * pair.current
      denominator += weight * pair.reference * pair.reference
    }
    return denominator > 0 ? numerator / denominator : 1
  }

  let slope = fit()
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const residuals = usable.map(
      (pair) => pair.current - slope * pair.reference
    )
    const cutoff = Math.max(robustScale(residuals), 0.005) * 1.5
    slope = fit(
      residuals.map((residual) =>
        Math.abs(residual) <= cutoff ? 1 : cutoff / Math.abs(residual)
      )
    )
  }

  const scale = Math.min(MAX_SCALE, Math.max(0, slope))
  return {
    scale,
    error: robustScale(
      usable.map((pair) => pair.current - scale * pair.reference)
    ),
  }
}
