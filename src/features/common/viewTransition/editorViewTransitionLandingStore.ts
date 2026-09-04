let glyphId: string | null = null
const listeners = new Set<() => void>()

const emitChange = () => {
  for (const listener of listeners) {
    listener()
  }
}

export function getEditorViewTransitionLandingGlyphId(): string | null {
  return glyphId
}

export function setEditorViewTransitionLandingGlyphId(
  nextGlyphId: string | null
): void {
  glyphId = nextGlyphId
  emitChange()
}

export function subscribeEditorViewTransitionLanding(
  listener: () => void
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
