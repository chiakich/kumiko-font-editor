import { toStableIdPart } from 'src/lib/openTypeFeatures/ids'
import type {
  OpenTypeFeaturesState,
  RawFeatureSnippet,
} from 'src/lib/openTypeFeatures/types'

const FEATURE_BLOCK_PATTERN =
  /\bfeature\s+([A-Za-z0-9]{4})\s*\{[\s\S]*?\}\s*\1\s*;/g

/**
 * Splits a raw FEA blob into per-feature / per-prefix snippets. Every
 * top-level `feature xxxx { ... } xxxx;` block becomes a 'feature' snippet;
 * the statements between feature blocks become 'prefix' snippets. Joining
 * the snippets back reproduces the source (modulo surrounding whitespace).
 */
export const splitRawFeatureTextIntoSnippets = (
  text: string
): RawFeatureSnippet[] => {
  const snippets: RawFeatureSnippet[] = []
  const usedIds = new Set<string>()
  let prefixCount = 0

  const makeUniqueId = (baseId: string) => {
    let id = baseId
    let suffix = 2
    while (usedIds.has(id)) {
      id = `${baseId}_${suffix}`
      suffix += 1
    }
    usedIds.add(id)
    return id
  }

  const pushPrefix = (segment: string) => {
    const trimmed = segment.trim()
    if (!trimmed) return
    prefixCount += 1
    snippets.push({
      id: makeUniqueId(`snippet_prefix_${prefixCount}`),
      kind: 'prefix',
      text: trimmed,
    })
  }

  let cursor = 0
  for (const match of text.matchAll(FEATURE_BLOCK_PATTERN)) {
    const start = match.index ?? 0
    pushPrefix(text.slice(cursor, start))
    const tag = match[1]
    snippets.push({
      id: makeUniqueId(`snippet_feature_${toStableIdPart(tag)}`),
      kind: 'feature',
      tag,
      text: match[0].trim(),
    })
    cursor = start + match[0].length
  }
  pushPrefix(text.slice(cursor))

  return snippets
}

export interface JoinRawFeatureSnippetsOptions {
  /** Include disabled snippets (default true). Classification and generated FEA pass false. */
  includeDisabled?: boolean
}

export const joinRawFeatureSnippets = (
  snippets: RawFeatureSnippet[],
  { includeDisabled = true }: JoinRawFeatureSnippetsOptions = {}
) =>
  snippets
    .filter((snippet) => includeDisabled || !snippet.disabled)
    .map((snippet) => snippet.text.trim())
    .filter(Boolean)
    .join('\n\n')

/**
 * The joined raw FEA source, falling back to the legacy single-blob field
 * for states persisted before snippets existed.
 */
export const getRawFeatureText = (
  state: Pick<OpenTypeFeaturesState, 'rawFeatureSnippets' | 'rawFeatureText'>,
  options: JoinRawFeatureSnippetsOptions = {}
): string | undefined => {
  if (state.rawFeatureSnippets && state.rawFeatureSnippets.length > 0) {
    const joined = joinRawFeatureSnippets(state.rawFeatureSnippets, options)
    return joined.length > 0 ? joined : undefined
  }
  return state.rawFeatureText
}

export const hasRawFeatureText = (
  state: Pick<OpenTypeFeaturesState, 'rawFeatureSnippets' | 'rawFeatureText'>
) => Boolean(getRawFeatureText(state)?.trim())

/**
 * Migrates the legacy `rawFeatureText` blob into `rawFeatureSnippets`.
 * Idempotent; run when loading persisted projects.
 */
export const normalizeRawFeatureSnippets = <
  T extends Pick<
    OpenTypeFeaturesState,
    'rawFeatureSnippets' | 'rawFeatureText'
  >,
>(
  state: T
): T => {
  if (state.rawFeatureText === undefined) return state
  const { rawFeatureText, ...rest } = state
  if ((state.rawFeatureSnippets?.length ?? 0) > 0) return rest as unknown as T
  return {
    ...rest,
    rawFeatureSnippets: splitRawFeatureTextIntoSnippets(rawFeatureText),
  } as unknown as T
}
