import { makeFeatureId, makeRuleId } from '@/lib/openTypeFeatures/ids'
import type {
  AlternateSubstitutionRule,
  FeatureRecord,
  LookupRecord,
  Rule,
  SingleSubstitutionRule,
} from '@/lib/openTypeFeatures/types'

export function mapFeatureTagsByLookupId(features: FeatureRecord[]) {
  const tagsByLookupId = new Map<string, string[]>()
  for (const feature of features) {
    for (const lookupId of feature.entries.flatMap(
      (entry) => entry.lookupIds
    )) {
      tagsByLookupId.set(lookupId, [
        ...(tagsByLookupId.get(lookupId) ?? []),
        feature.tag,
      ])
    }
  }
  return tagsByLookupId
}

export function formatSourceLabel(
  origin: Rule['meta']['origin'],
  featureTag: string
) {
  const source =
    origin === 'imported'
      ? 'Imported'
      : origin === 'auto'
        ? 'Generated'
        : 'Manual'
  return `${source} · ${featureTag}`
}

export function isAlternateSubstitutionRule(
  rule: Rule
): rule is AlternateSubstitutionRule {
  return rule.kind === 'alternateSubstitution'
}

export function ensureFeatureReferencesLookup(
  features: FeatureRecord[],
  featureTag: string,
  lookupId: string
): FeatureRecord[] {
  const feature = features.find((item) => item.tag === featureTag)
  if (!feature) {
    return [
      ...features,
      {
        id: makeFeatureId(featureTag),
        tag: featureTag,
        isActive: true,
        entries: [
          {
            id: `entry_${featureTag}_DFLT_dflt`,
            script: 'DFLT',
            language: 'dflt',
            lookupIds: [lookupId],
          },
        ],
        origin: 'manual',
      },
    ]
  }

  return features.map((item) => {
    if (item.id !== feature.id) return item
    if (item.entries.some((entry) => entry.lookupIds.includes(lookupId))) {
      return {
        ...item,
        origin: markFeatureOriginAsEdited(item.origin),
      }
    }

    const [firstEntry, ...restEntries] = item.entries
    const entries = firstEntry
      ? [
          {
            ...firstEntry,
            lookupIds: [...firstEntry.lookupIds, lookupId],
          },
          ...restEntries,
        ]
      : [
          {
            id: `entry_${featureTag}_${lookupId}`,
            script: 'DFLT',
            language: 'dflt',
            lookupIds: [lookupId],
          },
        ]

    return {
      ...item,
      origin: markFeatureOriginAsEdited(item.origin),
      entries,
    }
  })
}

export function makeSingleSubstitutionRule(
  featureTag: string,
  source: string,
  alternate: string
): SingleSubstitutionRule {
  return {
    id: makeRuleId([featureTag, source, alternate]),
    kind: 'singleSubstitution',
    target: { kind: 'glyph', glyph: source },
    replacement: alternate,
    meta: {
      origin: 'manual',
      userOverridden: true,
      dirty: true,
    },
  }
}

export function markLookupOriginAsEdited(
  origin: LookupRecord['origin']
): LookupRecord['origin'] {
  return origin === 'unsupported' ? origin : 'manual'
}

export function markFeatureOriginAsEdited(origin: FeatureRecord['origin']) {
  return origin === 'manual' ? 'manual' : 'mixed'
}
