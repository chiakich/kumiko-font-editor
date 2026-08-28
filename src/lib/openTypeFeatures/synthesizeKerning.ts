import type {
  GlyphSelector,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures/types'
import type { KerningGroup, KerningPair } from 'src/store/types'

// FEA identifier grammar (feaLib): names and glyph names may carry letters,
// digits, underscore and dots, and must not start with a digit.
const VALID_GLYPH_NAME = /^\.?[A-Za-z_][A-Za-z0-9._]*$/
const sanitizeClassName = (name: string) => {
  const cleaned = name.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '_')
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `kumiko_${cleaned}`
}

export interface SynthesizeKerningInput {
  kerningGroups?: readonly KerningGroup[]
  kerningPairs?: readonly KerningPair[]
  // Vertical (vkrn) pairs: values adjust the y-advance in vertical text.
  verticalKerningPairs?: readonly KerningPair[]
  // Glyphs actually present in the export; pairs and members outside are
  // dropped so feaLib never sees a name the font lacks.
  availableGlyphIds: ReadonlySet<string>
  // Pairs the IR's own kern feature already carries are skipped: both lookups
  // would apply and the kerning would double.
  state?: OpenTypeFeaturesState
}

export interface SyntheticKerningFea {
  text: string
  pairCount: number
  skippedPairCount: number
}

const selectorKey = (
  selector: GlyphSelector,
  classNameByRef: ReadonlyMap<string, string>
) =>
  selector.kind === 'glyph'
    ? `g:${selector.glyph}`
    : `c:${classNameByRef.get(selector.classId) ?? selector.classId.replace(/^@/, '')}`

// Pair keys the IR's own kerning feature (kern or vkrn) already positions
// (accepted suggestions or imported GPOS recreated as IR).
const collectIrKernPairKeys = (
  state: OpenTypeFeaturesState | undefined,
  tag: 'kern' | 'vkrn'
) => {
  const keys = new Set<string>()
  if (!state) {
    return keys
  }
  const classNameById = new Map(
    state.glyphClasses.map((glyphClass) => [
      glyphClass.id,
      glyphClass.name.replace(/^@/, ''),
    ])
  )
  const lookupById = new Map(state.lookups.map((lookup) => [lookup.id, lookup]))
  for (const feature of state.features) {
    if (feature.tag !== tag || !feature.isActive) {
      continue
    }
    for (const lookupId of feature.entries.flatMap(
      (entry) => entry.lookupIds
    )) {
      for (const rule of lookupById.get(lookupId)?.rules ?? []) {
        if (rule.kind !== 'pairPositioning') {
          continue
        }
        const left =
          rule.left.kind === 'glyph'
            ? `g:${rule.left.glyph}`
            : `c:${classNameById.get(rule.left.classId) ?? rule.left.classId.replace(/^@/, '')}`
        const right =
          rule.right.kind === 'glyph'
            ? `g:${rule.right.glyph}`
            : `c:${classNameById.get(rule.right.classId) ?? rule.right.classId.replace(/^@/, '')}`
        keys.add(`${left}|${right}`)
      }
    }
  }
  return keys
}

// Projects the project's kerning data (UFO kerning.plist model: groups +
// pairs) into a FEA kern feature, so kerning reaches every compiled binary —
// exports and the shaping preview alike — without a manual conversion step.
export const synthesizeKerningFea = (
  input: SynthesizeKerningInput
): SyntheticKerningFea | null => {
  const groups = input.kerningGroups ?? []
  const pairs = input.kerningPairs ?? []
  const verticalPairs = input.verticalKerningPairs ?? []
  if (pairs.length === 0 && verticalPairs.length === 0) {
    return null
  }

  // Group references arrive as ids or names; both map to one FEA class name.
  const classNameByRef = new Map<string, string>()
  const membersByClassName = new Map<string, string[]>()
  const usedNames = new Set<string>()
  for (const group of groups) {
    let className = sanitizeClassName(group.name)
    while (usedNames.has(className)) {
      className = `${className}_`
    }
    usedNames.add(className)
    const members = group.glyphs.filter(
      (glyphId) =>
        input.availableGlyphIds.has(glyphId) && VALID_GLYPH_NAME.test(glyphId)
    )
    classNameByRef.set(group.id, className)
    classNameByRef.set(group.name, className)
    classNameByRef.set(`@${group.name}`, className)
    membersByClassName.set(className, members)
  }

  const usedClassNames = new Set<string>()
  let skippedPairCount = 0

  const selectorText = (selector: GlyphSelector): string | null => {
    if (selector.kind === 'glyph') {
      return input.availableGlyphIds.has(selector.glyph) &&
        VALID_GLYPH_NAME.test(selector.glyph)
        ? selector.glyph
        : null
    }
    const className =
      classNameByRef.get(selector.classId) ??
      // A pair can reference a class the group list does not carry.
      null
    if (!className || (membersByClassName.get(className)?.length ?? 0) === 0) {
      return null
    }
    usedClassNames.add(className)
    return `@${className}`
  }

  const buildRules = (
    pairList: readonly KerningPair[],
    tag: 'kern' | 'vkrn'
  ): string[] => {
    const irPairKeys = collectIrKernPairKeys(input.state, tag)
    const ruleLines: string[] = []
    for (const pair of pairList) {
      if (!Number.isFinite(pair.value) || pair.value === 0) {
        skippedPairCount += 1
        continue
      }
      if (
        irPairKeys.has(
          `${selectorKey(pair.left, classNameByRef)}|${selectorKey(pair.right, classNameByRef)}`
        )
      ) {
        skippedPairCount += 1
        continue
      }
      const left = selectorText(pair.left)
      const right = selectorText(pair.right)
      if (!left || !right) {
        skippedPairCount += 1
        continue
      }
      const value = Math.round(pair.value)
      // vkrn adjusts the y-advance: spell out the value record so the
      // semantics never depend on feaLib's single-value special-casing.
      ruleLines.push(
        tag === 'vkrn'
          ? `    pos ${left} ${right} <0 0 0 ${value}>;`
          : `    pos ${left} ${right} ${value};`
      )
    }
    return ruleLines
  }

  const rules = buildRules(pairs, 'kern')
  const verticalRules = buildRules(verticalPairs, 'vkrn')

  if (rules.length === 0 && verticalRules.length === 0) {
    return null
  }

  const classLines = [...usedClassNames]
    .sort()
    .map(
      (className) =>
        `@${className} = [${(membersByClassName.get(className) ?? []).join(' ')}];`
    )

  const text = [
    '# Kumiko: kerning features synthesized from project kerning data.',
    ...classLines,
    ...(rules.length > 0 ? ['feature kern {', ...rules, '} kern;'] : []),
    ...(verticalRules.length > 0
      ? ['feature vkrn {', ...verticalRules, '} vkrn;']
      : []),
    '',
  ].join('\n')

  return {
    text,
    pairCount: rules.length + verticalRules.length,
    skippedPairCount,
  }
}
