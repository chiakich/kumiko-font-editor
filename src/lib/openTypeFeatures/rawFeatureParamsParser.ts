import { blankRange } from 'src/lib/openTypeFeatures/rawFeatureTextUtils'
import type {
  FeatureParamName,
  FeatureParams,
} from 'src/lib/openTypeFeatures/types'

export interface ExtractedFeatureParams {
  body: string
  featureParams?: FeatureParams
  unsupportedStatements: string[]
}

const STYLISTIC_SET_TAG_PATTERN = /^ss(0[1-9]|1[0-9]|20)$/
const CHARACTER_VARIANT_TAG_PATTERN = /^cv(0[1-9]|[1-9][0-9])$/

interface KeywordBlock {
  start: number
  end: number
  inner: string
  raw: string
}

const findKeywordBlocks = (body: string, keyword: string): KeywordBlock[] => {
  const blocks: KeywordBlock[] = []
  const pattern = new RegExp(`\\b${keyword}\\s*\\{`, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body))) {
    const braceStart = body.indexOf('{', match.index)
    let depth = 0
    let cursor = braceStart
    for (; cursor < body.length; cursor += 1) {
      if (body[cursor] === '{') depth += 1
      else if (body[cursor] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) return blocks

    const trailing = body.slice(cursor + 1).match(/^\s*;/)
    const end = trailing ? cursor + 1 + trailing[0].length : cursor + 1
    blocks.push({
      start: match.index,
      end,
      inner: body.slice(braceStart + 1, cursor),
      raw: body.slice(match.index, end).trim(),
    })
    pattern.lastIndex = end
  }
  return blocks
}

const unescapeFeaNameString = (text: string) =>
  text.replace(/\\([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  )

// Only the default-platform `name "text";` form is classified; name
// statements with explicit platform/encoding/language IDs stay raw so we
// never lose platform-specific strings in a lossy round trip.
const SIMPLE_NAME_STATEMENT_PATTERN =
  /^name\s+"((?:[^"\\]|\\[0-9a-fA-F]{4})*)"$/

const parseNameStatements = (inner: string): FeatureParamName[] | null => {
  const names: FeatureParamName[] = []
  const statements = inner
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
  for (const statement of statements) {
    const match = statement.match(SIMPLE_NAME_STATEMENT_PATTERN)
    if (!match) return null
    names.push({ text: unescapeFeaNameString(match[1]) })
  }
  return names
}

const parseCharacterValue = (token: string): number | null => {
  if (/^0x[0-9a-fA-F]+$/.test(token)) return Number.parseInt(token, 16)
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10)
  return null
}

const parseCvParametersInner = (inner: string): FeatureParams | null => {
  let working = inner
  const groups: Record<string, FeatureParamName[][]> = {
    FeatUILabelNameID: [],
    FeatUITooltipTextNameID: [],
    SampleTextNameID: [],
    ParamUILabelNameID: [],
  }

  for (const label of Object.keys(groups)) {
    for (const block of findKeywordBlocks(working, label)) {
      const names = parseNameStatements(block.inner)
      if (names === null) return null
      groups[label].push(names)
    }
    // Blank after collecting every block for this label so offsets stay valid.
    for (const block of [...findKeywordBlocks(working, label)].reverse()) {
      working = blankRange(working, block.start, block.end)
    }
  }

  const characters: number[] = []
  const leftovers = working
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
  for (const statement of leftovers) {
    const match = statement.match(/^Character\s+(\S+)$/)
    const value = match ? parseCharacterValue(match[1]) : null
    if (value === null) return null
    characters.push(value)
  }

  if (
    groups.FeatUILabelNameID.length > 1 ||
    groups.FeatUITooltipTextNameID.length > 1 ||
    groups.SampleTextNameID.length > 1
  ) {
    return null
  }

  return {
    kind: 'characterVariant',
    featUiLabelNames: groups.FeatUILabelNameID[0] ?? [],
    featUiTooltipTextNames: groups.FeatUITooltipTextNameID[0] ?? [],
    sampleTextNames: groups.SampleTextNameID[0] ?? [],
    paramUiLabelNames: groups.ParamUILabelNameID.flat(),
    characters,
  }
}

const parseDecipoints = (token: string): number | null => {
  if (/^\d+(\.\d+)?$/.test(token)) return Math.round(Number(token) * 10)
  return null
}

/**
 * Extracts feature-parameter statements (featureNames / cvParameters /
 * size parameters) from a raw feature block body. Extracted statements are
 * blanked out of the returned body; statements that cannot be classified
 * losslessly are reported as unsupported instead.
 */
export const extractFeatureParamsFromBody = (
  body: string,
  tag: string
): ExtractedFeatureParams => {
  let working = body
  const unsupportedStatements: string[] = []
  let featureParams: FeatureParams | undefined

  const featureNamesBlocks = findKeywordBlocks(working, 'featureNames')
  for (const block of [...featureNamesBlocks].reverse()) {
    working = blankRange(working, block.start, block.end)
  }
  if (featureNamesBlocks.length > 0) {
    const names = STYLISTIC_SET_TAG_PATTERN.test(tag)
      ? featureNamesBlocks
          .map((block) => parseNameStatements(block.inner))
          .reduce<
            FeatureParamName[] | null
          >((all, names) => (all && names ? [...all, ...names] : null), [])
      : null
    if (names && names.length > 0) {
      featureParams = { kind: 'stylisticSet', names }
    } else {
      unsupportedStatements.push(
        ...featureNamesBlocks.map((block) => block.raw)
      )
    }
  }

  const cvParametersBlocks = findKeywordBlocks(working, 'cvParameters')
  for (const block of [...cvParametersBlocks].reverse()) {
    working = blankRange(working, block.start, block.end)
  }
  if (cvParametersBlocks.length > 0) {
    const parsed =
      CHARACTER_VARIANT_TAG_PATTERN.test(tag) && cvParametersBlocks.length === 1
        ? parseCvParametersInner(cvParametersBlocks[0].inner)
        : null
    if (parsed) {
      featureParams = parsed
    } else {
      unsupportedStatements.push(
        ...cvParametersBlocks.map((block) => block.raw)
      )
    }
  }

  const parametersMatches = [
    ...working.matchAll(
      /\bparameters\s+(\d+(?:\.\d+)?)\s+(\d+)(?:\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?))?\s*;/g
    ),
  ]
  const sizemenunameMatches = [
    ...working.matchAll(
      /\bsizemenuname\s+"((?:[^"\\]|\\[0-9a-fA-F]{4})*)"\s*;/g
    ),
  ]
  if (parametersMatches.length > 0 || sizemenunameMatches.length > 0) {
    for (const match of [...parametersMatches].reverse()) {
      working = blankRange(
        working,
        match.index ?? 0,
        (match.index ?? 0) + match[0].length
      )
    }
    for (const match of [...sizemenunameMatches].reverse()) {
      working = blankRange(
        working,
        match.index ?? 0,
        (match.index ?? 0) + match[0].length
      )
    }

    const designSize =
      parametersMatches.length === 1
        ? parseDecipoints(parametersMatches[0][1])
        : null
    const subfamilyIdentifier =
      parametersMatches.length === 1
        ? Number.parseInt(parametersMatches[0][2], 10)
        : null
    const rangeStart = parametersMatches[0]?.[3]
      ? parseDecipoints(parametersMatches[0][3])
      : 0
    const rangeEnd = parametersMatches[0]?.[4]
      ? parseDecipoints(parametersMatches[0][4])
      : 0
    if (
      tag === 'size' &&
      designSize !== null &&
      subfamilyIdentifier !== null &&
      rangeStart !== null &&
      rangeEnd !== null
    ) {
      featureParams = {
        kind: 'size',
        designSize,
        subfamilyIdentifier,
        subfamilyNames: sizemenunameMatches.map((match) => ({
          text: unescapeFeaNameString(match[1]),
        })),
        rangeStart,
        rangeEnd,
      }
    } else {
      unsupportedStatements.push(
        ...parametersMatches.map((match) => match[0].trim()),
        ...sizemenunameMatches.map((match) => match[0].trim())
      )
    }
  }

  return { body: working, featureParams, unsupportedStatements }
}
