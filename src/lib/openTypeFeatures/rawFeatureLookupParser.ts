import type {
  FeatureOrigin,
  GlyphSelector,
  LookupFlagIR,
  LookupRecord,
  Rule,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'
import {
  selectorFromMarkedToken,
  selectorFromToken,
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
  lookupIdByName: Map<string, string>
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
  const tokens = context.trim().split(/\s+/).filter(Boolean)

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

    const parsed = selectorFromMarkedToken(token, glyphClassIdByName)
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
  lookupIdByName: Map<string, string>
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
  const tokens = context.trim().split(/\s+/).filter(Boolean)

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

    const parsed = selectorFromMarkedToken(token, glyphClassIdByName)
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
  glyphClassIdByName: Map<string, string>
): Rule | null => {
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

  const pattern = match[1].trim().split(/\s+/).filter(Boolean)
  const replacement = match[2].trim().split(/\s+/).filter(Boolean)
  if (
    pattern.length === 0 ||
    replacement.length === 0 ||
    replacement.some((glyph) => glyph.startsWith('@') || glyph.includes("'"))
  ) {
    return null
  }

  if (pattern.length === 1) {
    const target = selectorFromToken(pattern[0], glyphClassIdByName)
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
    pattern.some((token) => token.startsWith('@') || token.includes("'"))
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
  markClassIdByName: Map<string, string>
): Rule | null => {
  const cursiveMatch = matchPositioningStatement(
    statement,
    `cursive\\s+(\\S+)\\s+(${CURSIVE_ANCHOR_PATTERN})\\s+(${CURSIVE_ANCHOR_PATTERN})`
  )
  if (cursiveMatch) {
    const glyphs = selectorFromToken(cursiveMatch[1], glyphClassIdByName)
    const entryAnchor = parseCursiveAnchor(cursiveMatch[2])
    const exitAnchor = parseCursiveAnchor(cursiveMatch[3])
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

  const baseMatch = matchPositioningStatement(
    statement,
    'base\\s+(\\S+)\\s+(.+)'
  )
  if (baseMatch) {
    const baseGlyphs = selectorFromToken(baseMatch[1], glyphClassIdByName)
    const anchors = parseMarkAttachments(baseMatch[2], markClassIdByName)
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

  const markMatch = matchPositioningStatement(
    statement,
    'mark\\s+(\\S+)\\s+(.+)'
  )
  if (markMatch) {
    const baseMarks = selectorFromToken(markMatch[1], glyphClassIdByName)
    const anchors = parseMarkAttachments(markMatch[2], markClassIdByName)
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

  const ligatureMatch = matchPositioningStatement(
    statement,
    'ligature\\s+(\\S+)\\s+(.+)'
  )
  if (ligatureMatch) {
    const ligatures = selectorFromToken(ligatureMatch[1], glyphClassIdByName)
    const componentAnchors = parseLigatureComponentAnchors(
      ligatureMatch[2],
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
  glyphClassIdByName: Map<string, string>
): Rule | null => {
  const match = matchPositioningStatement(statement, '(\\S+)\\s+(.+)')
  if (!match) return null

  const left = selectorFromToken(match[1], glyphClassIdByName)
  if (!left) return null

  const rest = match[2].trim()
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

  const pairMatch = rest.match(
    /^(\S+)\s+(-?\d+|<[^>]+>)(?:\s+(-?\d+|<[^>]+>))?$/
  )
  if (!pairMatch) return null

  const right = selectorFromToken(pairMatch[1], glyphClassIdByName)
  const firstValue = parseValueRecord(pairMatch[2])
  const secondValue = pairMatch[3] ? parseValueRecord(pairMatch[3]) : null
  if (!right || !firstValue) return null
  if (pairMatch[3] && !secondValue) return null

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
  lookupIdByName: Map<string, string>
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
        lookupIdByName
      ) ??
      parseContextualPositioningRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        lookupIdByName
      ) ??
      parseSubstitutionRule(statement, ruleId, origin, glyphClassIdByName) ??
      parseMarkPositioningRule(
        statement,
        ruleId,
        origin,
        glyphClassIdByName,
        markClassIdByName
      ) ??
      parsePositioningRule(statement, ruleId, origin, glyphClassIdByName)

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
