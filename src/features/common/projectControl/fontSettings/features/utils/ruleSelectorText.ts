import type {
  GlyphSelector,
  OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'

// "@Name" in a selector field means a class; anything else is a glyph name.
// The mapping goes through class *names* because that is what people type,
// while the IR stores class ids.
export const selectorToText = (
  selector: GlyphSelector,
  state: OpenTypeFeaturesState
) => {
  if (selector.kind === 'glyph') {
    return selector.glyph
  }
  const glyphClass = state.glyphClasses.find(
    (candidate) => candidate.id === selector.classId
  )
  // Class names are stored with their '@' prefix, but older data may lack it.
  const name = glyphClass?.name ?? selector.classId
  return name.startsWith('@') ? name : `@${name}`
}

export const textToSelector = (
  text: string,
  state: OpenTypeFeaturesState
): GlyphSelector | null => {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.startsWith('@')) {
    const bare = trimmed.slice(1)
    const glyphClass = state.glyphClasses.find(
      (candidate) => candidate.name.replace(/^@/, '') === bare
    )
    return glyphClass ? { kind: 'class', classId: glyphClass.id } : null
  }
  return { kind: 'glyph', glyph: trimmed }
}
