import {
  RADAR_REFERENCE_FEATURE_KEYS,
  type RadarReferenceData,
  type RadarReferenceFeatureKey,
  type RadarReferenceResidualInput,
} from 'src/lib/qualityCheck/qualityRadar'

const DEFAULT_RADAR_REFERENCE_DATA_PATH =
  '/quality-reference/noto-sans-cjk-tc-regular-radar-residuals.json'

const REFERENCE_FEATURE_KEYS = RADAR_REFERENCE_FEATURE_KEYS

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseResidual = (value: unknown): RadarReferenceResidualInput | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (!isObject(value)) {
    return null
  }
  const residual = value.value
  if (typeof residual !== 'number' || !Number.isFinite(residual)) {
    return null
  }
  const confidence = value.confidence
  if (confidence === undefined) {
    return { value: residual }
  }
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return null
  }
  return { value: residual, confidence }
}

export const parseRadarReferenceData = (
  raw: unknown
): RadarReferenceData | null => {
  if (!isObject(raw) || !isObject(raw.residualsByCharacter)) {
    return null
  }

  const residualsByCharacter: RadarReferenceData['residualsByCharacter'] = {}
  for (const [character, featureMap] of Object.entries(
    raw.residualsByCharacter
  )) {
    if ([...character].length !== 1 || !isObject(featureMap)) {
      continue
    }
    const parsedFeatures: Partial<
      Record<RadarReferenceFeatureKey, RadarReferenceResidualInput>
    > = {}
    for (const [featureKey, residual] of Object.entries(featureMap)) {
      if (!REFERENCE_FEATURE_KEYS.has(featureKey as RadarReferenceFeatureKey)) {
        continue
      }
      const parsedResidual = parseResidual(residual)
      if (parsedResidual !== null) {
        parsedFeatures[featureKey as RadarReferenceFeatureKey] = parsedResidual
      }
    }
    if (Object.keys(parsedFeatures).length > 0) {
      residualsByCharacter[character] = parsedFeatures
    }
  }

  const defaultConfidence = raw.defaultConfidence
  return {
    source: typeof raw.source === 'string' ? raw.source : undefined,
    defaultConfidence:
      typeof defaultConfidence === 'number' &&
      Number.isFinite(defaultConfidence)
        ? defaultConfidence
        : undefined,
    residualsByCharacter,
  }
}

let defaultReferenceDataPromise: Promise<RadarReferenceData | null> | null =
  null

export const getDefaultRadarReferenceData = () => {
  if (!defaultReferenceDataPromise) {
    defaultReferenceDataPromise = fetch(DEFAULT_RADAR_REFERENCE_DATA_PATH)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json()
      })
      .then(parseRadarReferenceData)
      .catch(() => {
        defaultReferenceDataPromise = null
        return null
      })
  }
  return defaultReferenceDataPromise
}
