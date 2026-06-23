import type {
  FeatureOrigin,
  Rule,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'
import {
  glyphsFromRawSelectorToken,
  selectorFromRawToken,
  splitFirstGlyphPatternToken,
  type InlineGlyphClassRegistrar,
  type RawSelectorContext,
} from 'src/lib/openTypeFeatures/rawFeatureSelectorParser'

const POSITIONING_KEYWORD = '(?:pos|position)'
const ENUMERATED_POSITIONING_KEYWORD = `(?:enum|enumerate)\\s+${POSITIONING_KEYWORD}`

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
  glyphClassGlyphsByName?: Map<string, string[]>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): RawSelectorContext => ({
  glyphClassIdByName,
  glyphClassGlyphsByName,
  registerInlineGlyphClass,
})

const makeGposRuleMeta = (origin: FeatureOrigin) => ({
  origin,
  provenance: { table: 'GPOS' as const },
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
    undefined,
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
          meta: makeGposRuleMeta(origin),
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
          meta: makeGposRuleMeta(origin),
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
          meta: makeGposRuleMeta(origin),
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
          meta: makeGposRuleMeta(origin),
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
    undefined,
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
      meta: makeGposRuleMeta(origin),
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
    meta: makeGposRuleMeta(origin),
  }
}

const parseEnumeratedPairPositioningRules = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassGlyphsByName: Map<string, string[]>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule[] | null => {
  const match = statement.match(
    new RegExp(`^${ENUMERATED_POSITIONING_KEYWORD}\\s+(.+)$`, 'i')
  )
  if (!match) return null

  const selectorContext = makeSelectorContext(
    glyphClassIdByName,
    glyphClassGlyphsByName,
    registerInlineGlyphClass
  )
  const parsedLeft = splitFirstGlyphPatternToken(match[1])
  const parsedRight = parsedLeft
    ? splitFirstGlyphPatternToken(parsedLeft.rest)
    : null
  if (!parsedLeft || !parsedRight) return null

  const valueMatch = parsedRight.rest.match(
    /^(-?\d+|<[^>]+>)(?:\s+(-?\d+|<[^>]+>))?$/
  )
  if (!valueMatch) return null

  const leftGlyphs = glyphsFromRawSelectorToken(
    parsedLeft.token,
    selectorContext
  )
  const rightGlyphs = glyphsFromRawSelectorToken(
    parsedRight.token,
    selectorContext
  )
  const firstValue = parseValueRecord(valueMatch[1])
  const secondValue = valueMatch[2] ? parseValueRecord(valueMatch[2]) : null
  if (!leftGlyphs || !rightGlyphs || !firstValue) return null
  if (valueMatch[2] && !secondValue) return null

  const pairs = leftGlyphs.flatMap((left) =>
    rightGlyphs.map((right) => ({ left, right }))
  )
  return pairs.map((pair, index) => ({
    id: pairs.length === 1 ? ruleId : `${ruleId}_${index}`,
    kind: 'pairPositioning',
    left: { kind: 'glyph', glyph: pair.left },
    right: { kind: 'glyph', glyph: pair.right },
    firstValue,
    ...(secondValue ? { secondValue } : {}),
    meta: makeGposRuleMeta(origin),
  }))
}

export const parsePositioningRules = (
  statement: string,
  ruleId: string,
  origin: FeatureOrigin,
  glyphClassIdByName: Map<string, string>,
  glyphClassGlyphsByName: Map<string, string[]>,
  markClassIdByName: Map<string, string>,
  registerInlineGlyphClass?: InlineGlyphClassRegistrar
): Rule[] | null => {
  const enumeratedRules = parseEnumeratedPairPositioningRules(
    statement,
    ruleId,
    origin,
    glyphClassIdByName,
    glyphClassGlyphsByName,
    registerInlineGlyphClass
  )
  if (enumeratedRules) return enumeratedRules

  const rule =
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
  return rule ? [rule] : null
}
