import { RAW_FEATURE_TEXT_SOURCE_ID } from 'src/lib/openTypeFeatures/featureSourceSections'
import { toStableIdPart } from 'src/lib/openTypeFeatures/ids'
import {
  getLookupShape,
  parseLookupStatements,
  partitionLookupCandidates,
  type LookupDependencyCandidate,
} from 'src/lib/openTypeFeatures/rawFeatureLookupParser'
import type { InlineGlyphClassRegistrar } from 'src/lib/openTypeFeatures/rawFeatureSelectorParser'
import {
  glyphsForGdefClassToken,
  parseGdefBlock,
} from 'src/lib/openTypeFeatures/rawFeatureGdefParser'
import {
  blankRange,
  FEA_NAME_PATTERN,
  isInsideRange,
  makeGlyphClassId,
  makeLanguageSystemId,
  makeMarkClassId,
  splitGlyphList,
  splitStatements,
  stripComments,
} from 'src/lib/openTypeFeatures/rawFeatureTextUtils'
import type {
  FeatureDiagnostic,
  FeatureOrigin,
  FeatureRecord,
  GdefState,
  GlyphClass,
  LanguageSystem,
  LookupFlagIR,
  LookupOrigin,
  LookupRecord,
  MarkClass,
  OpenTypeFeaturesState,
  Rule,
} from 'src/lib/openTypeFeatures/types'

type RawFeatureTextOrigin = 'manual-input' | 'ufo-import'

interface ClassifyRawFeatureTextOptions {
  origin?: RawFeatureTextOrigin
}

interface ParsedLookup {
  id: string
  markAttachmentClassId?: string
  markFilteringSetClassId?: string
  name: string
  table: LookupRecord['table']
  lookupType: LookupRecord['lookupType']
  lookupFlag: LookupFlagIR
  rules: Rule[]
}

interface ParsedRawFeatureText {
  languageSystems: LanguageSystem[]
  glyphClasses: GlyphClass[]
  markClasses: MarkClass[]
  gdef: GdefState | null
  lookups: LookupRecord[]
  features: FeatureRecord[]
  unsupportedStatements: string[]
}

interface BlockMatch {
  body: string
  end: number
  name: string
  raw: string
  start: number
}

interface LookupCandidate extends LookupDependencyCandidate {
  record: LookupRecord
  raw: string
}

const RAW_FEATURE_DIAGNOSTIC_PREFIX =
  'feature-diagnostic-warning-raw-fea-parser'

const getFeatureOrigin = (origin: RawFeatureTextOrigin): FeatureOrigin =>
  origin === 'ufo-import' ? 'imported' : 'manual'

const getLookupOrigin = (origin: RawFeatureTextOrigin): LookupOrigin =>
  origin === 'ufo-import' ? 'imported' : 'manual'

const makeRawDiagnostic = (
  unsupportedStatements: string[]
): FeatureDiagnostic => ({
  id: `${RAW_FEATURE_DIAGNOSTIC_PREFIX}-unsupported-statements`,
  severity: 'warning',
  message: `Raw .fea source contains ${unsupportedStatements.length} statement${
    unsupportedStatements.length === 1 ? '' : 's'
  } that Kumiko cannot classify yet. The raw source is preserved for export.`,
  target: { kind: 'global' },
})

const collectNamedBlocks = (text: string, blockName: 'feature' | 'lookup') =>
  [
    ...text.matchAll(
      new RegExp(
        `\\b${blockName}\\s+(${blockName === 'feature' ? '[A-Za-z0-9]{4}' : FEA_NAME_PATTERN})\\s*\\{([\\s\\S]*?)\\}\\s*\\1\\s*;`,
        'g'
      )
    ),
  ].map(
    (match): BlockMatch => ({
      body: match[2],
      end: (match.index ?? 0) + match[0].length,
      name: match[1],
      raw: match[0],
      start: match.index ?? 0,
    })
  )

const collectGdefBlocks = (text: string) =>
  [...text.matchAll(/\btable\s+GDEF\s*\{([\s\S]*?)\}\s*GDEF\s*;/g)].map(
    (match): Omit<BlockMatch, 'name'> & { name: 'GDEF' } => ({
      body: match[1],
      end: (match.index ?? 0) + match[0].length,
      name: 'GDEF',
      raw: match[0],
      start: match.index ?? 0,
    })
  )

const toLookupRecord = (
  lookup: ParsedLookup,
  origin: LookupOrigin
): LookupRecord => ({
  id: lookup.id,
  markAttachmentClassId: lookup.markAttachmentClassId,
  markFilteringSetClassId: lookup.markFilteringSetClassId,
  name: lookup.name,
  table: lookup.table,
  lookupType: lookup.lookupType,
  lookupFlag: lookup.lookupFlag,
  rules: lookup.rules,
  editable: true,
  origin,
  meta: {
    sourceSectionId: RAW_FEATURE_TEXT_SOURCE_ID,
    classifiedFromRawFeatureText: true,
  },
})

const parseRawFeatureText = (
  rawFeatureText: string,
  sourceOrigin: RawFeatureTextOrigin
): ParsedRawFeatureText => {
  const featureOrigin = getFeatureOrigin(sourceOrigin)
  const lookupOrigin = getLookupOrigin(sourceOrigin)
  const glyphClasses: GlyphClass[] = []
  const glyphClassById = new Map<string, GlyphClass>()
  const markClassById = new Map<string, MarkClass>()
  let gdef: GdefState | null = null
  const lookups: LookupRecord[] = []
  const features: FeatureRecord[] = []
  const languageSystems = new Map<string, LanguageSystem>()
  const unsupportedStatements: string[] = []
  const glyphClassIdByName = new Map<string, string>()
  const glyphClassGlyphsByName = new Map<string, string[]>()
  const markClassIdByName = new Map<string, string>()
  const inlineGlyphClassIdByKey = new Map<string, string>()
  let workingText = stripComments(rawFeatureText)

  const registerInlineGlyphClass: InlineGlyphClassRegistrar = (glyphs) => {
    if (glyphs.length === 0) return null

    const key = glyphs.join(' ')
    const existingClassId = inlineGlyphClassIdByKey.get(key)
    if (existingClassId) return existingClassId

    const baseName = `@KumikoRawInline_${toStableIdPart(key)}`
    let name = baseName
    let classId = makeGlyphClassId(name)
    let suffix = 2
    while (glyphClassById.has(classId) || glyphClassIdByName.has(name)) {
      const existing = glyphClassById.get(classId)
      if (existing?.glyphs.join(' ') === key) {
        inlineGlyphClassIdByKey.set(key, classId)
        return classId
      }
      name = `${baseName}_${suffix}`
      classId = makeGlyphClassId(name)
      suffix += 1
    }

    const glyphClass: GlyphClass = {
      id: classId,
      name,
      glyphs,
      origin: featureOrigin,
      meta: {
        sourceSectionId: RAW_FEATURE_TEXT_SOURCE_ID,
        classifiedFromRawFeatureText: true,
      },
    }
    glyphClasses.push(glyphClass)
    glyphClassById.set(classId, glyphClass)
    glyphClassIdByName.set(name, classId)
    glyphClassGlyphsByName.set(name, glyphs)
    inlineGlyphClassIdByKey.set(key, classId)
    return classId
  }

  for (const match of workingText.matchAll(
    /@([A-Za-z0-9_.-]+)\s*=\s*\[([^\]]*)\]\s*;/g
  )) {
    const className = `@${match[1]}`
    const glyphs = splitGlyphList(match[2])
    const classId = makeGlyphClassId(className)
    glyphClassIdByName.set(className, classId)
    const glyphClass: GlyphClass = {
      id: classId,
      name: className,
      glyphs,
      origin: featureOrigin,
      meta: {
        sourceSectionId: RAW_FEATURE_TEXT_SOURCE_ID,
        classifiedFromRawFeatureText: true,
      },
    }
    glyphClasses.push(glyphClass)
    glyphClassById.set(classId, glyphClass)
    glyphClassGlyphsByName.set(className, glyphs)
    workingText = blankRange(
      workingText,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length
    )
  }

  for (const block of collectGdefBlocks(workingText)) {
    const parsed = parseGdefBlock(
      block.body,
      featureOrigin,
      glyphClassIdByName,
      glyphClassById
    )
    if (parsed.unsupportedStatements.length > 0 || !parsed.gdef) {
      unsupportedStatements.push(block.raw.trim())
    } else {
      gdef = parsed.gdef
    }
    workingText = blankRange(workingText, block.start, block.end)
  }

  for (const match of workingText.matchAll(
    /\bmarkClass\s+(.+?)\s+<\s*anchor\s+(-?\d+)\s+(-?\d+)\s*>\s+(@[A-Za-z_][A-Za-z0-9_.-]*)\s*;/g
  )) {
    const glyphs = glyphsForGdefClassToken(
      match[1],
      glyphClassIdByName,
      glyphClassById
    )
    if (!glyphs || glyphs.length === 0) continue

    const className = match[4]
    const classId = makeMarkClassId(className)
    markClassIdByName.set(className, classId)
    const existing = markClassById.get(classId)
    const markClass: MarkClass = existing ?? {
      id: classId,
      name: className,
      marks: [],
    }
    for (const glyph of glyphs) {
      markClass.marks.push({
        glyph,
        anchor: {
          x: Number(match[2]),
          y: Number(match[3]),
        },
      })
    }
    markClassById.set(classId, markClass)
    workingText = blankRange(
      workingText,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length
    )
  }

  for (const match of workingText.matchAll(
    /\blanguagesystem\s+([A-Za-z]{4})\s+([A-Za-z0-9_.-]{4})\s*;/g
  )) {
    const languageSystem: LanguageSystem = {
      id: makeLanguageSystemId(match[1], match[2]),
      script: match[1],
      language: match[2],
    }
    languageSystems.set(languageSystem.id, languageSystem)
    workingText = blankRange(
      workingText,
      match.index ?? 0,
      (match.index ?? 0) + match[0].length
    )
  }

  const featureBlocks = collectNamedBlocks(workingText, 'feature')
  const featureRanges = featureBlocks.map((block) => ({
    start: block.start,
    end: block.end,
  }))
  const lookupBlocks = collectNamedBlocks(workingText, 'lookup').filter(
    (block) => !isInsideRange(block.start, featureRanges)
  )
  const lookupIdByName = new Map(
    lookupBlocks.map((block) => [
      block.name,
      `lookup_raw_${toStableIdPart(block.name)}`,
    ])
  )
  const lookupCandidates: LookupCandidate[] = []

  for (const block of lookupBlocks) {
    const name = block.name
    const id = `lookup_raw_${toStableIdPart(name)}`
    const parsed = parseLookupStatements(
      block.body,
      id,
      featureOrigin,
      glyphClassIdByName,
      glyphClassGlyphsByName,
      markClassIdByName,
      lookupIdByName,
      registerInlineGlyphClass
    )
    const shape = getLookupShape(parsed.rules)
    if (parsed.unsupportedStatements.length > 0 || !shape) {
      unsupportedStatements.push(block.raw.trim())
    } else {
      lookupCandidates.push({
        raw: block.raw.trim(),
        record: toLookupRecord(
          {
            id,
            name,
            table: shape.table,
            lookupType: shape.lookupType,
            lookupFlag: parsed.lookupFlag,
            markAttachmentClassId: parsed.markAttachmentClassId,
            markFilteringSetClassId: parsed.markFilteringSetClassId,
            rules: parsed.rules,
          },
          lookupOrigin
        ),
      })
    }
    workingText = blankRange(workingText, block.start, block.end)
  }
  const partitionedLookupCandidates =
    partitionLookupCandidates(lookupCandidates)
  lookups.push(
    ...partitionedLookupCandidates.valid.map((candidate) => candidate.record)
  )
  unsupportedStatements.push(
    ...partitionedLookupCandidates.invalid.map((candidate) => candidate.raw)
  )

  const committedLookupIdByName = new Map(
    lookups.map((lookup) => [lookup.name, lookup.id])
  )
  const appendLookupId = (lookupIds: string[], lookupId: string) => {
    if (!lookupIds.includes(lookupId)) lookupIds.push(lookupId)
  }
  for (const block of collectNamedBlocks(workingText, 'feature')) {
    const tag = block.name
    let featureBody = block.body
    const scripts = [...featureBody.matchAll(/\bscript\s+([A-Za-z]{4})\s*;/g)]
    const languages = [
      ...featureBody.matchAll(/\blanguage\s+([A-Za-z0-9_.-]{4})\s*;/g),
    ]
    const script = scripts[0]?.[1] ?? 'DFLT'
    const language = languages[0]?.[1] ?? 'dflt'
    const lookupIds: string[] = []

    const localLookupBlocks = collectNamedBlocks(featureBody, 'lookup')
    const localLookupIdByName = new Map(
      localLookupBlocks.map((lookupBlock) => [
        lookupBlock.name,
        `lookup_raw_${toStableIdPart(tag)}_${toStableIdPart(lookupBlock.name)}`,
      ])
    )
    const featureLookupIdByName = new Map([
      ...committedLookupIdByName,
      ...localLookupIdByName,
    ])

    for (const lookupBlock of localLookupBlocks) {
      const lookupId = localLookupIdByName.get(lookupBlock.name)
      if (!lookupId) continue

      const parsed = parseLookupStatements(
        lookupBlock.body,
        lookupId,
        featureOrigin,
        glyphClassIdByName,
        glyphClassGlyphsByName,
        markClassIdByName,
        featureLookupIdByName,
        registerInlineGlyphClass
      )
      const shape = getLookupShape(parsed.rules)
      if (parsed.unsupportedStatements.length > 0 || !shape) {
        unsupportedStatements.push(lookupBlock.raw.trim())
      } else {
        const localLookup = toLookupRecord(
          {
            id: lookupId,
            name: lookupBlock.name,
            table: shape.table,
            lookupType: shape.lookupType,
            lookupFlag: parsed.lookupFlag,
            markAttachmentClassId: parsed.markAttachmentClassId,
            markFilteringSetClassId: parsed.markFilteringSetClassId,
            rules: parsed.rules,
          },
          lookupOrigin
        )
        lookups.push(localLookup)
        appendLookupId(lookupIds, localLookup.id)
      }
      featureBody = blankRange(featureBody, lookupBlock.start, lookupBlock.end)
    }

    for (const lookupRef of featureBody.matchAll(
      /\blookup\s+([A-Za-z_][A-Za-z0-9_.-]*)\s*;/g
    )) {
      const lookupId = featureLookupIdByName.get(lookupRef[1])
      if (lookupId) {
        appendLookupId(lookupIds, lookupId)
      } else {
        unsupportedStatements.push(lookupRef[0].trim())
      }
    }

    featureBody = featureBody
      .replace(/\bscript\s+[A-Za-z]{4}\s*;/g, '')
      .replace(/\blanguage\s+[A-Za-z0-9_.-]{4}\s*;/g, '')
      .replace(/\blookup\s+[A-Za-z_][A-Za-z0-9_.-]*\s*;/g, '')

    const inlineLookupId = `lookup_raw_${toStableIdPart(tag)}_${features.length}`
    const parsed = parseLookupStatements(
      featureBody,
      inlineLookupId,
      featureOrigin,
      glyphClassIdByName,
      glyphClassGlyphsByName,
      markClassIdByName,
      featureLookupIdByName,
      registerInlineGlyphClass
    )
    const shape = getLookupShape(parsed.rules)
    if (parsed.unsupportedStatements.length > 0) {
      unsupportedStatements.push(...parsed.unsupportedStatements)
    }
    if (shape && parsed.rules.length > 0) {
      const inlineLookup = toLookupRecord(
        {
          id: inlineLookupId,
          name: `raw_${tag}_${features.length}`,
          table: shape.table,
          lookupType: shape.lookupType,
          lookupFlag: parsed.lookupFlag,
          markAttachmentClassId: parsed.markAttachmentClassId,
          markFilteringSetClassId: parsed.markFilteringSetClassId,
          rules: parsed.rules,
        },
        lookupOrigin
      )
      lookups.push(inlineLookup)
      appendLookupId(lookupIds, inlineLookup.id)
    }

    const languageSystem = {
      id: makeLanguageSystemId(script, language),
      script,
      language,
    }
    languageSystems.set(languageSystem.id, languageSystem)
    features.push({
      id: `feature_raw_${toStableIdPart(tag)}`,
      tag,
      isActive: true,
      entries: [
        {
          id: `feature_entry_raw_${toStableIdPart(tag)}_${toStableIdPart(script)}_${toStableIdPart(language)}`,
          script,
          language,
          lookupIds,
        },
      ],
      origin: featureOrigin,
      meta: {
        sourceSectionId: RAW_FEATURE_TEXT_SOURCE_ID,
        classifiedFromRawFeatureText: true,
      },
    })
    workingText = blankRange(workingText, block.start, block.end)
  }

  const leftovers = splitStatements(workingText)
  unsupportedStatements.push(...leftovers)

  return {
    languageSystems: [...languageSystems.values()],
    glyphClasses,
    markClasses: [...markClassById.values()],
    gdef,
    lookups,
    features,
    unsupportedStatements,
  }
}

const recordIdsFor = (
  state: OpenTypeFeaturesState,
  kind:
    | 'languageSystem'
    | 'feature'
    | 'lookup'
    | 'glyphClass'
    | 'markClass'
    | 'gdef'
) =>
  new Set(
    (state.sourceSections ?? [])
      .find((section) => section.id === RAW_FEATURE_TEXT_SOURCE_ID)
      ?.recordRefs.filter((ref) => ref.kind === kind)
      .map((ref) => ref.id) ?? []
  )

const removePreviousRawFeatureTextClassification = (
  state: OpenTypeFeaturesState
): OpenTypeFeaturesState => {
  const languageSystemIds = recordIdsFor(state, 'languageSystem')
  const featureIds = recordIdsFor(state, 'feature')
  const lookupIds = recordIdsFor(state, 'lookup')
  const glyphClassIds = recordIdsFor(state, 'glyphClass')
  const markClassIds = recordIdsFor(state, 'markClass')
  const hasRawGdef = recordIdsFor(state, 'gdef').has('gdef')

  return {
    ...state,
    languagesystems: state.languagesystems.filter(
      (languageSystem) => !languageSystemIds.has(languageSystem.id)
    ),
    features: state.features.filter((feature) => !featureIds.has(feature.id)),
    lookups: state.lookups.filter((lookup) => !lookupIds.has(lookup.id)),
    glyphClasses: state.glyphClasses.filter(
      (glyphClass) => !glyphClassIds.has(glyphClass.id)
    ),
    markClasses: state.markClasses.filter(
      (markClass) => !markClassIds.has(markClass.id)
    ),
    gdef: hasRawGdef ? null : state.gdef,
    diagnostics: (state.diagnostics ?? []).filter(
      (diagnostic) => !diagnostic.id.startsWith(RAW_FEATURE_DIAGNOSTIC_PREFIX)
    ),
  }
}

const mergeById = <T extends { id: string }>(left: T[], right: T[]) => {
  const merged = new Map<string, T>()
  for (const item of left) merged.set(item.id, item)
  for (const item of right) merged.set(item.id, item)
  return [...merged.values()]
}

export const classifyRawFeatureTextSource = (
  state: OpenTypeFeaturesState,
  options: ClassifyRawFeatureTextOptions = {}
): OpenTypeFeaturesState => {
  const rawFeatureText = state.rawFeatureText?.trim()
  const baseState = removePreviousRawFeatureTextClassification(state)
  const sourceSections = baseState.sourceSections ?? []
  const sourceSection = sourceSections.find(
    (section) => section.id === RAW_FEATURE_TEXT_SOURCE_ID
  )
  if (!rawFeatureText || !sourceSection) {
    return baseState
  }

  const parsed = parseRawFeatureText(
    rawFeatureText,
    options.origin ??
      (sourceSection.origin === 'ufo-import' ? 'ufo-import' : 'manual-input')
  )
  const canCommitToModel =
    parsed.unsupportedStatements.length === 0 &&
    (parsed.features.length > 0 ||
      parsed.lookups.length > 0 ||
      parsed.glyphClasses.length > 0 ||
      parsed.markClasses.length > 0 ||
      Boolean(parsed.gdef) ||
      parsed.languageSystems.length > 0)

  if (!canCommitToModel) {
    return {
      ...baseState,
      diagnostics:
        parsed.unsupportedStatements.length > 0
          ? [
              ...(baseState.diagnostics ?? []),
              makeRawDiagnostic(parsed.unsupportedStatements),
            ]
          : baseState.diagnostics,
      sourceSections: sourceSections.map((section) =>
        section.id === RAW_FEATURE_TEXT_SOURCE_ID
          ? {
              ...section,
              stage: 'source',
              status: 'raw',
              recordRefs: [],
              meta: {
                ...section.meta,
                classifiedIntoModel: false,
                preserveRawTextInGeneratedFea: true,
                unsupportedStatementCount: parsed.unsupportedStatements.length,
                unsupportedStatements: parsed.unsupportedStatements.slice(0, 5),
              },
            }
          : section
      ),
    }
  }

  const recordRefs = [
    ...parsed.languageSystems.map((languageSystem) => ({
      kind: 'languageSystem' as const,
      id: languageSystem.id,
    })),
    ...parsed.glyphClasses.map((glyphClass) => ({
      kind: 'glyphClass' as const,
      id: glyphClass.id,
    })),
    ...parsed.markClasses.map((markClass) => ({
      kind: 'markClass' as const,
      id: markClass.id,
    })),
    ...(parsed.gdef ? [{ kind: 'gdef' as const, id: 'gdef' }] : []),
    ...parsed.lookups.map((lookup) => ({
      kind: 'lookup' as const,
      id: lookup.id,
      table: lookup.table,
    })),
    ...parsed.features.map((feature) => ({
      kind: 'feature' as const,
      id: feature.id,
    })),
  ]

  return {
    ...baseState,
    languagesystems: mergeById(
      baseState.languagesystems,
      parsed.languageSystems
    ),
    glyphClasses: mergeById(baseState.glyphClasses, parsed.glyphClasses),
    markClasses: mergeById(baseState.markClasses, parsed.markClasses),
    gdef: parsed.gdef ?? baseState.gdef,
    lookups: mergeById(baseState.lookups, parsed.lookups),
    features: mergeById(baseState.features, parsed.features),
    sourceSections: sourceSections.map((section) =>
      section.id === RAW_FEATURE_TEXT_SOURCE_ID
        ? {
            ...section,
            stage: 'classified',
            status: 'classified',
            recordRefs,
            meta: {
              ...section.meta,
              classifiedIntoModel: true,
              preserveRawTextInGeneratedFea: false,
              parsedFeatureCount: parsed.features.length,
              parsedLookupCount: parsed.lookups.length,
              parsedGlyphClassCount: parsed.glyphClasses.length,
              parsedMarkClassCount: parsed.markClasses.length,
              parsedGdef: Boolean(parsed.gdef),
              parsedLanguageSystemCount: parsed.languageSystems.length,
            },
          }
        : section
    ),
  }
}
