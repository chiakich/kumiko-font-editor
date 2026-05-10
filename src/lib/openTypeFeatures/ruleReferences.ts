import type {
  GlyphSelector,
  Rule,
  ValueRecord,
} from 'src/lib/openTypeFeatures/types'

export const getSelectorGlyphs = (selector: GlyphSelector) =>
  selector.kind === 'glyph' ? [selector.glyph] : []

export const getSelectorClassIds = (selector: GlyphSelector) =>
  selector.kind === 'class' ? [selector.classId] : []

export const getRuleGlyphReferences = (rule: Rule): string[] => {
  switch (rule.kind) {
    case 'singleSubstitution':
      return [...getSelectorGlyphs(rule.target), rule.replacement]
    case 'multipleSubstitution':
      return [rule.target, ...rule.replacement]
    case 'alternateSubstitution':
      return [rule.target, ...rule.alternates]
    case 'ligatureSubstitution':
      return [...rule.components, rule.replacement]
    case 'pairPositioning':
      return [...getSelectorGlyphs(rule.left), ...getSelectorGlyphs(rule.right)]
    case 'singlePositioning':
      return getSelectorGlyphs(rule.target)
    case 'contextualSubstitution':
    case 'contextualPositioning':
      return [
        ...rule.backtrack.flatMap(getSelectorGlyphs),
        ...rule.input.flatMap((input) => getSelectorGlyphs(input.selector)),
        ...rule.lookahead.flatMap(getSelectorGlyphs),
      ]
    case 'markToBase':
      return getSelectorGlyphs(rule.baseGlyphs)
    case 'markToMark':
      return getSelectorGlyphs(rule.baseMarks)
    case 'markToLigature':
      return getSelectorGlyphs(rule.ligatures)
    case 'cursivePositioning':
      return getSelectorGlyphs(rule.glyphs)
  }
}

export const getRuleClassReferences = (rule: Rule): string[] => {
  switch (rule.kind) {
    case 'singleSubstitution':
      return getSelectorClassIds(rule.target)
    case 'pairPositioning':
      return [
        ...getSelectorClassIds(rule.left),
        ...getSelectorClassIds(rule.right),
      ]
    case 'singlePositioning':
      return getSelectorClassIds(rule.target)
    case 'contextualSubstitution':
    case 'contextualPositioning':
      return [
        ...rule.backtrack.flatMap(getSelectorClassIds),
        ...rule.input.flatMap((input) => getSelectorClassIds(input.selector)),
        ...rule.lookahead.flatMap(getSelectorClassIds),
      ]
    case 'markToBase':
      return getSelectorClassIds(rule.baseGlyphs)
    case 'markToMark':
      return getSelectorClassIds(rule.baseMarks)
    case 'markToLigature':
      return getSelectorClassIds(rule.ligatures)
    case 'cursivePositioning':
      return getSelectorClassIds(rule.glyphs)
    case 'multipleSubstitution':
    case 'alternateSubstitution':
    case 'ligatureSubstitution':
      return []
  }
}

export const getNestedLookupReferences = (rule: Rule) =>
  rule.kind === 'contextualSubstitution' ||
  rule.kind === 'contextualPositioning'
    ? rule.input.flatMap((input) => input.lookupIds ?? [])
    : []

export const hasValueRecordValue = (value: ValueRecord | undefined) =>
  Boolean(
    value &&
    Object.values(value).some(
      (entry) => typeof entry === 'number' && Number.isFinite(entry)
    )
  )

export const getRuleValueRecords = (rule: Rule): ValueRecord[] => {
  switch (rule.kind) {
    case 'pairPositioning':
      return [rule.firstValue, rule.secondValue].filter(
        (value): value is ValueRecord => Boolean(value)
      )
    case 'singlePositioning':
      return [rule.value]
    default:
      return []
  }
}
