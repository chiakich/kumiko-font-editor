import type {
  GlyphsDocument,
  OpenStepValue,
} from 'src/lib/fontFormats/glyphsDocument'
import { toStableIdPart } from 'src/lib/openTypeFeatures/ids'
import type {
  OpenTypeFeaturesState,
  RawFeatureSnippet,
} from 'src/lib/openTypeFeatures/types'

type Raw = Record<string, OpenStepValue | undefined>

const asRecord = (value: OpenStepValue | undefined): Raw =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Raw)
    : {}

const asText = (value: OpenStepValue | undefined): string =>
  typeof value === 'string' ? value : ''

const asFlag = (value: OpenStepValue | undefined): boolean =>
  value === 1 || value === '1' || value === true

const FEATURE_TAG_PATTERN = /^[A-Za-z0-9]{4}$/

const indentFeatureBody = (code: string) =>
  code
    .replace(/\s+$/, '')
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : ''))
    .join('\n')

/**
 * Converts the Glyphs document's `classes`, `featurePrefixes`, and
 * `features` lists into raw feature snippets. Glyphs stores feature code
 * without the `feature xxxx { ... } xxxx;` wrapper, so feature snippets are
 * wrapped on import and unwrapped again on export. Glyphs 2 uses `name` for
 * the feature tag, Glyphs 3 uses `tag`; both are accepted.
 */
export const buildRawFeatureSnippetsFromGlyphsDocument = (
  document: Pick<GlyphsDocument, 'classes' | 'featurePrefixes' | 'features'>
): RawFeatureSnippet[] => {
  const snippets: RawFeatureSnippet[] = []
  const usedIds = new Set<string>()

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

  ;(document.classes ?? []).map(asRecord).forEach((entry, index) => {
    const name = asText(entry.name) || `Class${index + 1}`
    const code = asText(entry.code).trim()
    if (!code) return
    snippets.push({
      id: makeUniqueId(`snippet_class_${toStableIdPart(name)}`),
      kind: 'prefix',
      name: `@${name}`,
      text: `@${name} = [${code}];`,
      meta: {
        glyphsKind: 'class',
        glyphsName: name,
        ...(asFlag(entry.automatic) ? { glyphsAutomatic: true } : {}),
      },
    })
  })
  ;(document.featurePrefixes ?? []).map(asRecord).forEach((entry, index) => {
    const name = asText(entry.name) || `Prefix ${index + 1}`
    const code = asText(entry.code).trim()
    if (!code) return
    snippets.push({
      id: makeUniqueId(`snippet_prefix_${toStableIdPart(name)}`),
      kind: 'prefix',
      name,
      text: code,
      meta: {
        glyphsKind: 'prefix',
        glyphsName: name,
        ...(asFlag(entry.automatic) ? { glyphsAutomatic: true } : {}),
      },
    })
  })
  ;(document.features ?? []).map(asRecord).forEach((entry, index) => {
    const tag = asText(entry.tag) || asText(entry.name)
    const code = asText(entry.code).replace(/\s+$/, '')
    if (!FEATURE_TAG_PATTERN.test(tag) || !code.trim()) return
    const notes = asText(entry.notes)
    snippets.push({
      id: makeUniqueId(`snippet_feature_${toStableIdPart(tag)}`),
      kind: 'feature',
      tag,
      text: `feature ${tag} {\n${indentFeatureBody(code)}\n} ${tag};`,
      ...(asFlag(entry.disabled) ? { disabled: true } : {}),
      meta: {
        glyphsKind: 'feature',
        glyphsIndex: index,
        ...(asFlag(entry.automatic) ? { glyphsAutomatic: true } : {}),
        ...(notes ? { glyphsNotes: notes } : {}),
      },
    })
  })

  return snippets
}

const unwrapFeatureSnippetText = (snippet: RawFeatureSnippet): string => {
  const match = snippet.text.match(
    /^\s*feature\s+[A-Za-z0-9]{4}\s*\{\n?([\s\S]*?)\n?\}\s*[A-Za-z0-9]{4}\s*;\s*$/
  )
  if (!match) return snippet.text
  return match[1]
    .split('\n')
    .map((line) => (line.startsWith('  ') ? line.slice(2) : line))
    .join('\n')
}

export interface GlyphsFeatureFields {
  classes: OpenStepValue[]
  featurePrefixes: OpenStepValue[]
  features: OpenStepValue[]
}

const CLASS_SNIPPET_TEXT_PATTERN = /^@[A-Za-z0-9_.-]+\s*=\s*\[([\s\S]*)\]\s*;$/

/**
 * Rebuilds the Glyphs `classes` / `featurePrefixes` / `features` lists from
 * raw feature snippets for export. Returns null when the state has no
 * snippets, so callers can fall back to the imported document metadata.
 */
export const buildGlyphsFeatureFieldsFromSnippets = (
  state: Pick<OpenTypeFeaturesState, 'rawFeatureSnippets'> | null | undefined
): GlyphsFeatureFields | null => {
  const snippets = state?.rawFeatureSnippets
  if (!snippets || snippets.length === 0) return null

  const fields: GlyphsFeatureFields = {
    classes: [],
    featurePrefixes: [],
    features: [],
  }

  snippets.forEach((snippet, index) => {
    const automatic =
      snippet.meta?.glyphsAutomatic === true ? { automatic: 1 } : {}
    if (snippet.kind === 'feature') {
      const tag = snippet.tag ?? `fea${index}`
      fields.features.push({
        ...automatic,
        ...(snippet.disabled ? { disabled: 1 } : {}),
        name: tag,
        code: `${unwrapFeatureSnippetText(snippet)}\n`,
        ...(typeof snippet.meta?.glyphsNotes === 'string'
          ? { notes: snippet.meta.glyphsNotes }
          : {}),
      })
      return
    }

    if (snippet.meta?.glyphsKind === 'class') {
      const classMatch = snippet.text.trim().match(CLASS_SNIPPET_TEXT_PATTERN)
      const name =
        typeof snippet.meta.glyphsName === 'string'
          ? snippet.meta.glyphsName
          : (snippet.name?.replace(/^@/, '') ?? `Class${index + 1}`)
      if (classMatch) {
        fields.classes.push({
          ...automatic,
          name,
          code: classMatch[1].trim(),
        })
        return
      }
    }

    fields.featurePrefixes.push({
      ...automatic,
      name:
        (typeof snippet.meta?.glyphsName === 'string'
          ? snippet.meta.glyphsName
          : snippet.name) ?? `Kumiko prefix ${index + 1}`,
      code: `${snippet.text.trim()}\n`,
    })
  })

  return fields
}
