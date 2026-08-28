import type {
  HarfBuzzDirection,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'

export type PreviewDirection = Extract<HarfBuzzDirection, 'ltr' | 'ttb'>

// Features HarfBuzz applies without being asked (the required/default set for
// horizontal text). Everything else starts life off, which is exactly the
// on/off state the toggle chips show.
const DEFAULT_ON_FEATURES = new Set([
  'abvm',
  'blwm',
  'calt',
  'ccmp',
  'clig',
  'curs',
  'dist',
  'kern',
  'liga',
  'locl',
  'mark',
  'mkmk',
  'rclt',
  'rlig',
  'rvrn',
])

// The only feature hb-ot-shape enables for vertical text; vrt2/vkrn are NOT
// applied by default, so their chips must start off (and stay toggleable).
const VERTICAL_ON_FEATURES = new Set(['vert'])

// HarfBuzz applies these only when shaping horizontally (hb-ot-shape's
// horizontal_features list); in vertical text they stay off, so the chips
// must not claim kern/liga apply to a ttb run.
const HORIZONTAL_ONLY_FEATURES = new Set([
  'calt',
  'clig',
  'curs',
  'dist',
  'kern',
  'liga',
  'rclt',
])

export const isFeatureOnByDefault = (
  tag: string,
  direction: PreviewDirection = 'ltr'
) =>
  direction === 'ttb'
    ? (DEFAULT_ON_FEATURES.has(tag) && !HORIZONTAL_ONLY_FEATURES.has(tag)) ||
      VERTICAL_ON_FEATURES.has(tag)
    : DEFAULT_ON_FEATURES.has(tag)

export interface PreviewFeatureToggle {
  tag: string
  // Whether HarfBuzz would apply it with no explicit request.
  defaultOn: boolean
}

// Every feature the state knows about, whether it lives in the IR or only in a
// raw snippet, deduplicated and in source order.
export const listPreviewFeatureToggles = (
  state: OpenTypeFeaturesState | undefined,
  direction: PreviewDirection = 'ltr',
  // Tags present in the compiled font beyond the feature state — today the
  // kern feature synthesized from project kerning data.
  extraTags: readonly string[] = []
): PreviewFeatureToggle[] => {
  if (!state && extraTags.length === 0) {
    return []
  }
  const tags: string[] = []
  const seen = new Set<string>()
  const push = (tag: string | undefined) => {
    if (tag && /^[a-z0-9]{4}$/i.test(tag) && !seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
  }
  for (const feature of state?.features ?? []) {
    push(feature.tag)
  }
  for (const tag of extraTags) {
    push(tag)
  }
  // Raw-authoritative snippets carry feature blocks the IR does not model;
  // their tags still deserve a chip.
  const activeSnippets =
    state?.rawFeatureSnippets?.filter((snippet) => !snippet.disabled) ?? []
  for (const snippet of activeSnippets) {
    if (snippet.kind === 'feature') {
      push(snippet.tag)
    }
  }
  // Prefix snippets can still hold hand-written feature blocks.
  const rawText = activeSnippets.map((snippet) => snippet.text).join('\n')
  if (rawText) {
    for (const match of rawText.matchAll(
      /^\s*feature\s+([A-Za-z0-9]{4})\b/gm
    )) {
      push(match[1])
    }
  }
  return tags
    .map((tag) => ({ tag, defaultOn: isFeatureOnByDefault(tag, direction) }))
    .sort((left, right) => left.tag.localeCompare(right.tag))
}

// The feature string HarfBuzz shapes with: only deviations from its defaults
// need saying, and both directions need saying explicitly.
export const buildShapingFeatureList = (
  toggles: readonly PreviewFeatureToggle[],
  overrides: Readonly<Record<string, boolean>>
): string[] =>
  toggles.flatMap((toggle) => {
    const enabled = overrides[toggle.tag] ?? toggle.defaultOn
    if (enabled === toggle.defaultOn) {
      return []
    }
    return [enabled ? `+${toggle.tag}` : `-${toggle.tag}`]
  })

// The "before" run: every listed feature forced off, so the comparison shows
// exactly what this font's features do.
export const buildDisabledFeatureList = (
  toggles: readonly PreviewFeatureToggle[]
): string[] => toggles.map((toggle) => `-${toggle.tag}`)
