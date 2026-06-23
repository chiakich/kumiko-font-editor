import type {
  FeatureOrigin,
  GlyphSelector,
  LookupFlagIR,
  LookupRecord,
  Rule,
} from 'src/lib/openTypeFeatures/types'
import { parsePositioningRules } from 'src/lib/openTypeFeatures/rawFeaturePositioningParser'
import { parseSubstitutionRules } from 'src/lib/openTypeFeatures/rawFeatureSubstitutionParser'
import {
  selectorFromRawMarkedToken,
  splitCommaSeparatedContexts,
  splitGlyphPatternTokens,
  type InlineGlyphClassRegistrar,
  type RawSelectorContext,
} from 'src/lib/openTypeFeatures/rawFeatureSelectorParser'
import { splitStatements } from 'src/lib/openTypeFeatures/rawFeatureTextUtils'

export interface ParsedLookupStatements {
  rules: Rule[]
  lookupFlag: LookupFlagIR
  markAttachmentClassId?: string
  markFilteringSetClassId?: string
  unsupportedStatements: string[]
}

export interface LookupDependencyCandidate {
  record: {
    id: string
    rules: Rule[]
  }
  raw: string
}

const SUBSTITUTION_KEYWORD = '(?:sub|substitute)'
const POSITIONING_KEYWORD = '(?:pos|position)'

const matchSubstitutionStatement = (statement: string, bodyPattern: string) =>
  statement.match(
    new RegExp(`^${SUBSTITUTION_KEYWORD}\\s+${bodyPattern}$`, 'i')
  )

const matchPositioningStatement = (statement: string, bodyPattern: string) =>
  statement.match(new RegExp(`^${POSITIONING_KEYWORD}\\s+${bodyPattern}$`, 'i'))

const isSubtableBreakStatement = (statement: string) =>
  /^subtable$/i.test(statement)

const parseLookupFlagStatement = (
  statement: string,
  glyphClassIdByName: Map<string, string>
): {
  lookupFlag: LookupFlagIR
  markAttachmentClassId?: string
  markFilteringSetClassId?: string
} | null => {
  const match = statement.match(/^lookupflag\s+(.+)$/i)
  if (!match) return null

  const tokens = match[1].trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 1 && tokens[0] === '0') {
    return { lookupFlag: {} }
  }
  if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
    const value = Number(tokens[0])
    if (value & ~0x000f) return null
    return {
      lookupFlag: {
        rightToLeft: Boolean(value & 0x0001) || undefined,
        ignoreBaseGlyphs: Boolean(value & 0x0002) || undefined,
        ignoreLigatures: Boolean(value & 0x0004) || undefined,
        ignoreMarks: Boolean(value & 0x0008) || undefined,
      },
    }
  }

  const lookupFlag: LookupFlagIR = {}
  let markAttachmentClassId: string | undefined
  let markFilteringSetClassId: string | undefined

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (/^RightToLeft$/i.test(token)) {
      lookupFlag.rightToLeft = true
      continue
    }
    if (/^IgnoreBaseGlyphs$/i.test(token)) {
      lookupFlag.ignoreBaseGlyphs = true
      continue
    }
    if (/^IgnoreLigatures$/i.test(token)) {
      lookupFlag.ignoreLigatures = true
      continue
    }
    if (/^IgnoreMarks$/i.test(token)) {
      lookupFlag.ignoreMarks = true
      continue
    }
    if (/^MarkAttachmentType$/i.test(token)) {
      const className = tokens[index + 1]
      const classId = className ? glyphClassIdByName.get(className) : undefined
      if (!classId) return null
      lookupFlag.markAttachmentType = true
      markAttachmentClassId = classId
      index += 1
      continue
    }
    if (/^UseMarkFilteringSet$/i.test(token)) {
      const className = tokens[index + 1]
      const classId = className ? glyphClassIdByName.get(className) : undefined
      if (!classId) return null
      lookupFlag.useMarkFilteringSet = true
      markFilteringSetClassId = classId
      index += 1
      continue
    }

    return null
  }

  return {
    lookupFlag,
    markAttachmentClassId,
    markFilteringSetClassId,
  }
}

const makeSelectorContext = (
  glyphClassIdByName: Map<string, string>,
  glyphClassGlyphsByName?: Map<string, string[]>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): RawSelectorContext => ({
  glyphClassIdByName,
  glyphClassGlyphsByName,
  registerInlineGlyphClass,
})

const parseContextualSubstitutionRule = (
  context: string,
  ignore: boolean,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  if (!context || /\sby\s/i.test(context)) return null

  const selectorEntries: Array<{
    lookupIds: string[]
    marked: boolean
    selector: GlyphSelector
  }> = []
  const tokens = splitGlyphPatternTokens(context)
  if (!tokens) return null
  const selectorContext = makeSelectorContext(
    glyphClassIdByName,
    undefined,
    registerInlineGlyphClass
  )

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (/^lookup$/i.test(token)) {
      const lookupName = tokens[index + 1]
      const lookupId = lookupName ? lookupIdByName.get(lookupName) : undefined
      const previousEntry = selectorEntries.at(-1)
      if (!lookupId || !previousEntry?.marked) return null
      previousEntry.lookupIds.push(lookupId)
      index += 1
      continue
    }

    const parsed = selectorFromRawMarkedToken(token, selectorContext)
    if (!parsed) return null
    selectorEntries.push({
      lookupIds: [],
      marked: parsed.marked,
      selector: parsed.selector,
    })
  }

  const firstInputIndex = selectorEntries.findIndex((entry) => entry.marked)
  const lastInputIndex = selectorEntries.findLastIndex((entry) => entry.marked)
  if (firstInputIndex < 0 || lastInputIndex < firstInputIndex) return null

  const inputEntries = selectorEntries.slice(
    firstInputIndex,
    lastInputIndex + 1
  )
  if (inputEntries.some((entry) => !entry.marked)) return null
  if (ignore && inputEntries.some((entry) => entry.lookupIds.length > 0)) {
    return null
  }
  if (!ignore && inputEntries.every((entry) => entry.lookupIds.length === 0)) {
    return null
  }

  return {
    id: ruleId,
    kind: 'contextualSubstitution',
    mode: 'chaining',
    backtrack: selectorEntries
      .slice(0, firstInputIndex)
      .map((entry) => entry.selector),
    input: inputEntries.map((entry) => ({
      selector: entry.selector,
      ...(entry.lookupIds.length > 0 ? { lookupIds: entry.lookupIds } : {}),
    })),
    lookahead: selectorEntries
      .slice(lastInputIndex + 1)
      .map((entry) => entry.selector),
    meta: {
      origin,
      provenance: { table: 'GSUB' },
    },
  }
}

const parseContextualSubstitutionRules = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule[] | null => {
  const ignoreMatch = statement.match(
    new RegExp(`^ignore\\s+${SUBSTITUTION_KEYWORD}\\s+(.+)$`, 'i')
  )
  const substituteMatch = matchSubstitutionStatement(statement, '(.+)')
  const context = ignoreMatch?.[1] ?? substituteMatch?.[1]
  const contexts = ignoreMatch
    ? splitCommaSeparatedContexts(context ?? '')
    : context
      ? [context]
      : null
  if (!contexts) return null

  const rules = contexts.map((entry, index) =>
    parseContextualSubstitutionRule(
      entry,
      Boolean(ignoreMatch),
      contexts.length === 1 ? ruleId : `${ruleId}_${index}`,
      origin,
      glyphClassIdByName,
      lookupIdByName,
      registerInlineGlyphClass
    )
  )
  return rules.every((rule): rule is Rule => Boolean(rule)) ? rules : null
}

const parseContextualPositioningRule = (
  context: string,
  ignore: boolean,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  if (!context || /(?:^|\s)(?:-?\d+|<[^>]+>)\s*$/i.test(context)) return null

  const selectorEntries: Array<{
    lookupIds: string[]
    marked: boolean
    selector: GlyphSelector
  }> = []
  const tokens = splitGlyphPatternTokens(context)
  if (!tokens) return null
  const selectorContext = makeSelectorContext(
    glyphClassIdByName,
    undefined,
    registerInlineGlyphClass
  )

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (/^lookup$/i.test(token)) {
      const lookupName = tokens[index + 1]
      const lookupId = lookupName ? lookupIdByName.get(lookupName) : undefined
      const previousEntry = selectorEntries.at(-1)
      if (!lookupId || !previousEntry?.marked) return null
      previousEntry.lookupIds.push(lookupId)
      index += 1
      continue
    }

    const parsed = selectorFromRawMarkedToken(token, selectorContext)
    if (!parsed) return null
    selectorEntries.push({
      lookupIds: [],
      marked: parsed.marked,
      selector: parsed.selector,
    })
  }

  const firstInputIndex = selectorEntries.findIndex((entry) => entry.marked)
  const lastInputIndex = selectorEntries.findLastIndex((entry) => entry.marked)
  if (firstInputIndex < 0 || lastInputIndex < firstInputIndex) return null

  const inputEntries = selectorEntries.slice(
    firstInputIndex,
    lastInputIndex + 1
  )
  if (inputEntries.some((entry) => !entry.marked)) return null
  if (ignore && inputEntries.some((entry) => entry.lookupIds.length > 0)) {
    return null
  }
  if (!ignore && inputEntries.every((entry) => entry.lookupIds.length === 0)) {
    return null
  }

  return {
    id: ruleId,
    kind: 'contextualPositioning',
    mode: 'chaining',
    backtrack: selectorEntries
      .slice(0, firstInputIndex)
      .map((entry) => entry.selector),
    input: inputEntries.map((entry) => ({
      selector: entry.selector,
      ...(entry.lookupIds.length > 0 ? { lookupIds: entry.lookupIds } : {}),
    })),
    lookahead: selectorEntries
      .slice(lastInputIndex + 1)
      .map((entry) => entry.selector),
    meta: {
      origin,
      provenance: { table: 'GPOS' },
    },
  }
}

const parseContextualPositioningRules = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule[] | null => {
  const ignoreMatch = statement.match(
    new RegExp(`^ignore\\s+${POSITIONING_KEYWORD}\\s+(.+)$`, 'i')
  )
  const positionMatch = matchPositioningStatement(statement, '(.+)')
  const context = ignoreMatch?.[1] ?? positionMatch?.[1]
  const contexts = ignoreMatch
    ? splitCommaSeparatedContexts(context ?? '')
    : context
      ? [context]
      : null
  if (!contexts) return null

  const rules = contexts.map((entry, index) =>
    parseContextualPositioningRule(
      entry,
      Boolean(ignoreMatch),
      contexts.length === 1 ? ruleId : `${ruleId}_${index}`,
      origin,
      glyphClassIdByName,
      lookupIdByName,
      registerInlineGlyphClass
    )
  )
  return rules.every((rule): rule is Rule => Boolean(rule)) ? rules : null
}

export const getLookupShape = (rules: Rule[]) => {
  const firstRule = rules[0]
  if (!firstRule) return null

  const lookupTypeByRuleKind: Partial<
    Record<Rule['kind'], LookupRecord['lookupType']>
  > = {
    singleSubstitution: 'singleSubst',
    multipleSubstitution: 'multipleSubst',
    alternateSubstitution: 'alternateSubst',
    ligatureSubstitution: 'ligatureSubst',
    contextualSubstitution: 'chainingContextSubst',
    contextualPositioning: 'chainingContextPos',
    singlePositioning: 'singlePos',
    pairPositioning: 'pairPos',
    cursivePositioning: 'cursivePos',
    markToBase: 'markToBasePos',
    markToMark: 'markToMarkPos',
    markToLigature: 'markToLigaturePos',
  }
  const lookupType = lookupTypeByRuleKind[firstRule.kind]
  if (!lookupType) return null

  const table: LookupRecord['table'] =
    firstRule.kind === 'singlePositioning' ||
    firstRule.kind === 'pairPositioning' ||
    firstRule.kind === 'contextualPositioning' ||
    firstRule.kind === 'cursivePositioning' ||
    firstRule.kind === 'markToBase' ||
    firstRule.kind === 'markToMark' ||
    firstRule.kind === 'markToLigature'
      ? 'GPOS'
      : 'GSUB'
  const allSameShape = rules.every(
    (rule) => lookupTypeByRuleKind[rule.kind] === lookupType
  )
  if (!allSameShape) return null

  return { table, lookupType }
}

export const parseLookupStatements = (
  body: string,
  idPrefix: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassGlyphsByName: Map<string, string[]>,
  markClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): ParsedLookupStatements => {
  const rules: Rule[] = []
  const unsupportedStatements: string[] = []
  let lookupFlag: LookupFlagIR = {}
  let markAttachmentClassId: string | undefined
  let markFilteringSetClassId: string | undefined

  for (const [index, statement] of splitStatements(body).entries()) {
    if (isSubtableBreakStatement(statement)) {
      continue
    }

    const lookupFlagStatement = parseLookupFlagStatement(
      statement,
      glyphClassIdByName
    )
    if (lookupFlagStatement) {
      lookupFlag = { ...lookupFlag, ...lookupFlagStatement.lookupFlag }
      markAttachmentClassId =
        lookupFlagStatement.markAttachmentClassId ?? markAttachmentClassId
      markFilteringSetClassId =
        lookupFlagStatement.markFilteringSetClassId ?? markFilteringSetClassId
      continue
    }

    const ruleId = `${idPrefix}_rule_${index}`
    const parsedRules =
      parseContextualSubstitutionRules(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        lookupIdByName,
        registerInlineGlyphClass
      ) ??
      parseContextualPositioningRules(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        lookupIdByName,
        registerInlineGlyphClass
      )

    const substitutionRules =
      parsedRules === null
        ? parseSubstitutionRules(
            statement,
            ruleId,
            origin,
            glyphClassIdByName,
            glyphClassGlyphsByName,
            registerInlineGlyphClass
          )
        : null

    const positioningRules =
      parsedRules === null && substitutionRules === null
        ? parsePositioningRules(
            statement,
            ruleId,
            origin,
            glyphClassIdByName,
            glyphClassGlyphsByName,
            markClassIdByName,
            registerInlineGlyphClass
          )
        : null

    if (parsedRules) {
      rules.push(...parsedRules)
    } else if (substitutionRules) {
      rules.push(...substitutionRules)
    } else if (positioningRules) {
      rules.push(...positioningRules)
    } else {
      unsupportedStatements.push(statement)
    }
  }

  return {
    rules,
    lookupFlag,
    markAttachmentClassId,
    markFilteringSetClassId,
    unsupportedStatements,
  }
}

const referencedLookupIdsForRules = (rules: Rule[]) =>
  rules.flatMap((rule) =>
    rule.kind === 'contextualSubstitution' ||
    rule.kind === 'contextualPositioning'
      ? rule.input.flatMap((entry) => entry.lookupIds ?? [])
      : []
  )

export const partitionLookupCandidates = <T extends LookupDependencyCandidate>(
  candidates: T[]
) => {
  const validIds = new Set(candidates.map((candidate) => candidate.record.id))
  let changed = true

  while (changed) {
    changed = false
    for (const candidate of candidates) {
      if (!validIds.has(candidate.record.id)) continue
      const references = referencedLookupIdsForRules(candidate.record.rules)
      if (references.some((lookupId) => !validIds.has(lookupId))) {
        validIds.delete(candidate.record.id)
        changed = true
      }
    }
  }

  return {
    invalid: candidates.filter(
      (candidate) => !validIds.has(candidate.record.id)
    ),
    valid: candidates.filter((candidate) => validIds.has(candidate.record.id)),
  }
}
