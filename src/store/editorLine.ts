import type { FontData, GlobalState } from 'src/store/types'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'

const getGlyphCharacterById = (
  fontData: FontData | null | undefined,
  glyphId: string
) => {
  return getGlyphUnicodeChar(fontData?.glyphs[glyphId]) ?? ''
}

export const syncEditorTextFromGlyphIds = (state: GlobalState) => {
  state.editorText = state.editorGlyphIds
    .map((glyphId) => getGlyphCharacterById(state.fontData, glyphId))
    .join('')
}

export const clampEditorCursorIndex = (
  state: GlobalState,
  cursorIndex: number
) => Math.max(0, Math.min(cursorIndex, state.editorGlyphIds.length))

export const clampEditorActiveGlyphIndex = (
  state: GlobalState,
  activeGlyphIndex: number
) =>
  Math.max(
    0,
    Math.min(activeGlyphIndex, Math.max(0, state.editorGlyphIds.length - 1))
  )

export const syncSelectedGlyphFromEditorLine = (state: GlobalState) => {
  if (state.editorGlyphIds.length === 0) {
    state.selectedGlyphId = null
    state.editorActiveGlyphIndex = 0
    return
  }

  state.editorActiveGlyphIndex = clampEditorActiveGlyphIndex(
    state,
    state.editorActiveGlyphIndex
  )
  state.selectedGlyphId =
    state.editorGlyphIds[state.editorActiveGlyphIndex] ?? null
}
