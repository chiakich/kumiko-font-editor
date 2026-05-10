export const toStableIdPart = (value: string) =>
  value
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item'

export const makeFeatureId = (tag: string) => `feature_${toStableIdPart(tag)}`

export const makeLookupId = (tag: string, origin = 'auto') =>
  `lookup_${toStableIdPart(tag)}_${toStableIdPart(origin)}`

export const makeRuleId = (parts: string[]) =>
  `rule_${toStableIdPart(parts.join('_'))}`

export const makeSuggestionId = (featureTag: string, ruleIds: string[]) =>
  `suggestion_${toStableIdPart(featureTag)}_${toStableIdPart(ruleIds.join('_'))}`
