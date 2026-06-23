import type {
  FeatureOrigin,
  GlyphSelector,
  LookupFlagIR,
  LookupRecord,
  Rule,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'
import {
  isInlineGlyphClassToken,
  selectorFromRawMarkedToken,
  selectorFromRawToken,
  splitFirstGlyphPatternToken,
  splitGlyphPatternTokens,
  type InlineGlyphClassRegistrar,
  type RawSelectorContext,
} from 'src/lib/openTypeFeatures/rawFeatureSelectorParser'
import {
  splitGlyphList,
  splitStatements,
} from 'src/lib/openTypeFeatures/rawFeatureTextUtils'

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

const parseValueRecord = (value: string): ValueRecord | null => {
  if (/^-?\d+$/.test(value)) {
    return { xAdvance: Number(value) }
  }

  const match = value.match(/^<\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*>$/)
  if (!match) return null

  return {
    xPlacement: Number(match[1]),
    yPlacement: Number(match[2]),
    xAdvance: Number(match[3]),
    yAdvance: Number(match[4]),
  }
}

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

const parseMarkAttachments = (
  body: string,
  markClassIdByName: Map<string, string>
) => {
  const anchors: Record<string, { x: number; y: number }> = {}
  let rest = body.trim()

  while (rest) {
    const match = rest.match(
      /^<\s*anchor\s+(-?\d+)\s+(-?\d+)\s*>\s+mark\s+(@[A-Za-z_][A-Za-z0-9_.-]*)\s*/i
    )
    if (!match) return null

    const markClassId = markClassIdByName.get(match[3])
    if (!markClassId) return null

    anchors[markClassId] = {
      x: Number(match[1]),
      y: Number(match[2]),
    }
    rest = rest.slice(match[0].length).trim()
  }

  return Object.keys(anchors).length > 0 ? anchors : null
}

const parseLigatureComponentAnchors = (
  body: string,
  markClassIdByName: Map<string, string>
) => {
  const components = body
    .split(/\s+ligComponent\s+/i)
    .map((component) => component.trim())
    .filter(Boolean)
  if (components.length === 0) return null

  const componentAnchors = components.map((component) =>
    parseMarkAttachments(component, markClassIdByName)
  )
  return componentAnchors.every(
    (anchors): anchors is Record<string, { x: number; y: number }> =>
      Boolean(anchors)
  )
    ? componentAnchors
    : null
}

const CURSIVE_ANCHOR_PATTERN = '<\\s*anchor\\s+(?:NULL|-?\\d+\\s+-?\\d+)\\s*>'

const makeSelectorContext = (
  glyphClassIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): RawSelectorContext => ({
  glyphClassIdByName,
  registerInlineGlyphClass,
})

const parseCursiveAnchor = (value: string) => {
  if (/^<\s*anchor\s+NULL\s*>$/i.test(value)) {
    return undefined
  }

  const match = value.match(/^<\s*anchor\s+(-?\d+)\s+(-?\d+)\s*>$/i)
  return match
    ? {
        x: Number(match[1]),
        y: Number(match[2]),
      }
    : null
}

const parseContextualSubstitutionRule = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  const ignoreMatch = statement.match(
    new RegExp(`^ignore\\s+${SUBSTITUTION_KEYWORD}\\s+(.+)$`, 'i')
  )
  const substituteMatch = matchSubstitutionStatement(statement, '(.+)')
  const context = ignoreMatch?.[1] ?? substituteMatch?.[1]
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
  if (ignoreMatch && inputEntries.some((entry) => entry.lookupIds.length > 0)) {
    return null
  }
  if (
    substituteMatch &&
    inputEntries.every((entry) => entry.lookupIds.length === 0)
  ) {
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

const parseContextualPositioningRule = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  lookupIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  const ignoreMatch = statement.match(
    new RegExp(`^ignore\\s+${POSITIONING_KEYWORD}\\s+(.+)$`, 'i')
  )
  const positionMatch = matchPositioningStatement(statement, '(.+)')
  const context = ignoreMatch?.[1] ?? positionMatch?.[1]
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
  if (ignoreMatch && inputEntries.some((entry) => entry.lookupIds.length > 0)) {
    return null
  }
  if (
    positionMatch &&
    inputEntries.every((entry) => entry.lookupIds.length === 0)
  ) {
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

const parseSubstitutionRule = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  const selectorContext = makeSelectorContext(
    glyphClassIdByName,
    registerInlineGlyphClass
  )
  const alternateMatch = matchSubstitutionStatement(
    statement,
    '(\\S+)\\s+from\\s+\\[([^\\]]+)\\]'
  )
  if (alternateMatch) {
    const target = alternateMatch[1]
    const alternates = splitGlyphList(alternateMatch[2])
    if (
      target.startsWith('@') ||
      target.includes("'") ||
      alternates.length === 0 ||
      alternates.some((glyph) => glyph.startsWith('@') || glyph.includes("'"))
    ) {
      return null
    }

    return {
      id: ruleId,
      kind: 'alternateSubstitution',
      target,
      alternates,
      meta: {
        origin,
        provenance: { table: 'GSUB' },
      },
    }
  }

  const match = matchSubstitutionStatement(statement, '(.+?)\\s+by\\s+(.+)')
  if (!match) return null

  const pattern = splitGlyphPatternTokens(match[1])
  const replacement = splitGlyphPatternTokens(match[2])
  if (
    !pattern ||
    !replacement ||
    pattern.length === 0 ||
    replacement.length === 0 ||
    replacement.some(
      (glyph) =>
        glyph.startsWith('@') ||
        glyph.includes("'") ||
        isInlineGlyphClassToken(glyph)
    )
  ) {
    return null
  }

  if (pattern.length === 1) {
    const target = selectorFromRawToken(pattern[0], selectorContext)
    if (!target) return null

    if (replacement.length === 1) {
      return {
        id: ruleId,
        kind: 'singleSubstitution',
        target,
        replacement: replacement[0],
        meta: {
          origin,
          provenance: { table: 'GSUB' },
        },
      }
    }

    return target.kind === 'glyph'
      ? {
          id: ruleId,
          kind: 'multipleSubstitution',
          target: target.glyph,
          replacement,
          meta: {
            origin,
            provenance: { table: 'GSUB' },
          },
        }
      : null
  }

  if (
    replacement.length !== 1 ||
    pattern.some(
      (token) =>
        token.startsWith('@') ||
        token.includes("'") ||
        isInlineGlyphClassToken(token)
    )
  ) {
    return null
  }

  return {
    id: ruleId,
    kind: 'ligatureSubstitution',
    components: pattern,
    replacement: replacement[0],
    meta: {
      origin,
      provenance: { table: 'GSUB' },
    },
  }
}

const parseMarkPositioningRule = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  markClassIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  const selectorContext = makeSelectorContext(
    glyphClassIdByName,
    registerInlineGlyphClass
  )
  const cursiveMatch = matchPositioningStatement(statement, 'cursive\\s+(.+)')
  if (cursiveMatch) {
    const parsedGlyphs = splitFirstGlyphPatternToken(cursiveMatch[1])
    const anchorMatch = parsedGlyphs?.rest.match(
      new RegExp(
        `^(${CURSIVE_ANCHOR_PATTERN})\\s+(${CURSIVE_ANCHOR_PATTERN})$`,
        'i'
      )
    )
    if (!parsedGlyphs || !anchorMatch) return null
    const glyphs = selectorFromRawToken(parsedGlyphs.token, selectorContext)
    const entryAnchor = parseCursiveAnchor(anchorMatch[1])
    const exitAnchor = parseCursiveAnchor(anchorMatch[2])
    return glyphs &&
      entryAnchor !== null &&
      exitAnchor !== null &&
      (entryAnchor || exitAnchor)
      ? {
          id: ruleId,
          kind: 'cursivePositioning',
          glyphs,
          entryAnchor,
          exitAnchor,
          meta: {
            origin,
            provenance: { table: 'GPOS' },
          },
        }
      : null
  }

  const baseMatch = matchPositioningStatement(statement, 'base\\s+(.+)')
  if (baseMatch) {
    const parsedBase = splitFirstGlyphPatternToken(baseMatch[1])
    if (!parsedBase) return null
    const baseGlyphs = selectorFromRawToken(parsedBase.token, selectorContext)
    const anchors = parseMarkAttachments(parsedBase.rest, markClassIdByName)
    return baseGlyphs && anchors
      ? {
          id: ruleId,
          kind: 'markToBase',
          baseGlyphs,
          anchors,
          meta: {
            origin,
            provenance: { table: 'GPOS' },
          },
        }
      : null
  }

  const markMatch = matchPositioningStatement(statement, 'mark\\s+(.+)')
  if (markMatch) {
    const parsedMark = splitFirstGlyphPatternToken(markMatch[1])
    if (!parsedMark) return null
    const baseMarks = selectorFromRawToken(parsedMark.token, selectorContext)
    const anchors = parseMarkAttachments(parsedMark.rest, markClassIdByName)
    return baseMarks && anchors
      ? {
          id: ruleId,
          kind: 'markToMark',
          baseMarks,
          anchors,
          meta: {
            origin,
            provenance: { table: 'GPOS' },
          },
        }
      : null
  }

  const ligatureMatch = matchPositioningStatement(statement, 'ligature\\s+(.+)')
  if (ligatureMatch) {
    const parsedLigature = splitFirstGlyphPatternToken(ligatureMatch[1])
    if (!parsedLigature) return null
    const ligatures = selectorFromRawToken(
      parsedLigature.token,
      selectorContext
    )
    const componentAnchors = parseLigatureComponentAnchors(
      parsedLigature.rest,
      markClassIdByName
    )
    return ligatures && componentAnchors
      ? {
          id: ruleId,
          kind: 'markToLigature',
          ligatures,
          componentAnchors,
          meta: {
            origin,
            provenance: { table: 'GPOS' },
          },
        }
      : null
  }

  return null
}

const parsePositioningRule = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule | null => {
  const match = matchPositioningStatement(statement, '(.+)')
  if (!match) return null

  const selectorContext = makeSelectorContext(
    glyphClassIdByName,
    registerInlineGlyphClass
  )
  const parsedLeft = splitFirstGlyphPatternToken(match[1])
  if (!parsedLeft) return null

  const left = selectorFromRawToken(parsedLeft.token, selectorContext)
  if (!left) return null

  const rest = parsedLeft.rest
  const singleValue = parseValueRecord(rest)
  if (singleValue) {
    return {
      id: ruleId,
      kind: 'singlePositioning',
      target: left,
      value: singleValue,
      meta: {
        origin,
        provenance: { table: 'GPOS' },
      },
    }
  }

  const parsedRight = splitFirstGlyphPatternToken(rest)
  if (!parsedRight) return null
  const pairMatch = parsedRight.rest.match(
    /^(-?\d+|<[^>]+>)(?:\s+(-?\d+|<[^>]+>))?$/
  )
  if (!pairMatch) return null

  const right = selectorFromRawToken(parsedRight.token, selectorContext)
  const firstValue = parseValueRecord(pairMatch[1])
  const secondValue = pairMatch[2] ? parseValueRecord(pairMatch[2]) : null
  if (!right || !firstValue) return null
  if (pairMatch[2] && !secondValue) return null

  return {
    id: ruleId,
    kind: 'pairPositioning',
    left,
    right,
    firstValue,
    ...(secondValue ? { secondValue } : {}),
    meta: {
      origin,
      provenance: { table: 'GPOS' },
    },
  }
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
    const rule =
      parseContextualSubstitutionRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        lookupIdByName,
        registerInlineGlyphClass
      ) ??
      parseContextualPositioningRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        lookupIdByName,
        registerInlineGlyphClass
      ) ??
      parseSubstitutionRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        registerInlineGlyphClass
      ) ??
      parseMarkPositioningRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        markClassIdByName,
        registerInlineGlyphClass
      ) ??
      parsePositioningRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        registerInlineGlyphClass
      )

    if (rule) {
      rules.push(rule)
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
