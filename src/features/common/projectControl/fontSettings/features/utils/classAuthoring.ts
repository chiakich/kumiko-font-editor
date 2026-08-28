import { getRuleClassReferences } from 'src/lib/openTypeFeatures/ruleReferences'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

// FEA class-name grammar (isValidGlyphClassName): '@' then a letter or
// underscore, then letters/digits/underscore/dots. The IR stores class names
// WITH their '@' prefix (matching serializeFea, which emits them verbatim).
export const sanitizeGlyphClassName = (name: string) => {
  const cleaned = name
    .replace(/^@/, '')
    .trim()
    .replace(/[^A-Za-z0-9._]/g, '_')
  if (!cleaned) {
    return ''
  }
  return `@${/^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`}`
}

// Everything that keeps a class alive: rule selectors plus lookup-level
// mark-attachment / mark-filtering references. One pass over all lookups.
export const countGlyphClassReferences = (
  state: OpenTypeFeaturesState
): Map<string, number> => {
  const counts = new Map<string, number>()
  const bump = (classId: string) =>
    counts.set(classId, (counts.get(classId) ?? 0) + 1)
  for (const lookup of state.lookups) {
    if (lookup.markAttachmentClassId) {
      bump(lookup.markAttachmentClassId)
    }
    if (lookup.markFilteringSetClassId) {
      bump(lookup.markFilteringSetClassId)
    }
    for (const rule of lookup.rules) {
      for (const classId of getRuleClassReferences(rule)) {
        bump(classId)
      }
    }
  }
  return counts
}

export const countGlyphClassRuleReferences = (
  state: OpenTypeFeaturesState,
  classId: string
) => countGlyphClassReferences(state).get(classId) ?? 0

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
  let classId = `class_${name.replace(/^@/, '')}`
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
  // Renaming onto an existing class would serialize two definitions of the
  // same @name, which feaLib rejects; refuse the collision instead.
  if (
    name &&
    state.glyphClasses.some(
      (glyphClass) => glyphClass.id !== classId && glyphClass.name === name
    )
  ) {
    return state
  }
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
