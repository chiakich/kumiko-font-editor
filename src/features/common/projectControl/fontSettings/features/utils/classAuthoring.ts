import { getRuleClassReferences } from 'src/lib/openTypeFeatures/ruleReferences'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

// FEA class-name grammar: letters, digits, underscore and dots; must not
// start with a digit.
export const sanitizeGlyphClassName = (name: string) => {
  const cleaned = name
    .replace(/^@/, '')
    .trim()
    .replace(/[^A-Za-z0-9._]/g, '_')
  if (!cleaned) {
    return ''
  }
  return /^[A-Za-z_.]/.test(cleaned) ? cleaned : `_${cleaned}`
}

export const countGlyphClassRuleReferences = (
  state: OpenTypeFeaturesState,
  classId: string
) =>
  state.lookups
    .flatMap((lookup) => lookup.rules)
    .filter((rule) => getRuleClassReferences(rule).includes(classId)).length

export function createGlyphClass(
  state: OpenTypeFeaturesState,
  rawName: string
): { state: OpenTypeFeaturesState; classId: string } | null {
  const name = sanitizeGlyphClassName(rawName)
  if (!name) {
    return null
  }
  const existing = state.glyphClasses.find(
    (glyphClass) => glyphClass.name === name
  )
  if (existing) {
    return { state, classId: existing.id }
  }
  let classId = `class_${name}`
  const existingIds = new Set(state.glyphClasses.map((entry) => entry.id))
  let suffix = 1
  while (existingIds.has(classId)) {
    suffix += 1
    classId = `class_${name}_${suffix}`
  }
  return {
    classId,
    state: {
      ...state,
      glyphClasses: [
        ...state.glyphClasses,
        { id: classId, name, glyphs: [], origin: 'manual' },
      ],
    },
  }
}

export function updateGlyphClass(
  state: OpenTypeFeaturesState,
  classId: string,
  update: { name?: string; glyphs?: string[] }
): OpenTypeFeaturesState {
  const name =
    update.name !== undefined ? sanitizeGlyphClassName(update.name) : undefined
  return {
    ...state,
    glyphClasses: state.glyphClasses.map((glyphClass) =>
      glyphClass.id === classId
        ? {
            ...glyphClass,
            ...(name ? { name } : {}),
            ...(update.glyphs
              ? { glyphs: [...new Set(update.glyphs.filter(Boolean))] }
              : {}),
            meta: { ...glyphClass.meta, userOverridden: true },
          }
        : glyphClass
    ),
  }
}

// Refuses to delete a class that rules still reference — the caller shows the
// reference count instead.
export function deleteGlyphClass(
  state: OpenTypeFeaturesState,
  classId: string
): OpenTypeFeaturesState | null {
  if (countGlyphClassRuleReferences(state, classId) > 0) {
    return null
  }
  return {
    ...state,
    glyphClasses: state.glyphClasses.filter(
      (glyphClass) => glyphClass.id !== classId
    ),
  }
}
