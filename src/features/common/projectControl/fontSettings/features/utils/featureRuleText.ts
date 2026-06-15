import type { GlyphSelector, Rule, ValueRecord } from 'src/lib/openTypeFeatures'

export function formatGlyphSelector(selector: GlyphSelector) {
  return selector.kind === 'class' ? selector.classId : selector.glyph
}

export function formatValueRecord(value?: ValueRecord) {
  if (!value) {
    return 'none'
  }

  const xPlacement = value.xPlacement ?? 0
  const yPlacement = value.yPlacement ?? 0
  const xAdvance = value.xAdvance ?? 0
  const yAdvance = value.yAdvance ?? 0

  if (xPlacement === 0 && yPlacement === 0 && yAdvance === 0) {
    return String(xAdvance)
  }

  return `<${xPlacement} ${yPlacement} ${xAdvance} ${yAdvance}>`
}

export function formatRuleSummary(rule: Rule) {
  switch (rule.kind) {
    case 'singleSubstitution':
      return `sub ${formatGlyphSelector(rule.target)} by ${rule.replacement}`
    case 'multipleSubstitution':
      return `sub ${rule.target} by ${rule.replacement.join(' ')}`
    case 'alternateSubstitution':
      return `sub ${rule.target} from [${rule.alternates.join(' ')}]`
    case 'ligatureSubstitution':
      return `sub ${rule.components.join(' ')} by ${rule.replacement}`
    case 'pairPositioning':
      return `pos ${formatGlyphSelector(rule.left)} ${formatGlyphSelector(
        rule.right
      )} ${formatValueRecord(rule.firstValue)}`
    case 'singlePositioning':
      return `pos ${formatGlyphSelector(rule.target)} ${formatValueRecord(
        rule.value
      )}`
    case 'contextualSubstitution':
    case 'contextualPositioning':
      return `${rule.mode} ${rule.input
        .map((input) => formatGlyphSelector(input.selector))
        .join(' ')}`
    case 'markToBase':
      return `pos base ${formatGlyphSelector(rule.baseGlyphs)}`
    case 'markToMark':
      return `pos mark ${formatGlyphSelector(rule.baseMarks)}`
    case 'markToLigature':
      return `pos ligature ${formatGlyphSelector(rule.ligatures)}`
    case 'cursivePositioning':
      return `pos cursive ${formatGlyphSelector(rule.glyphs)}`
  }
}
