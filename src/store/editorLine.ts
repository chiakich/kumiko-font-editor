import type { FontData, GlobalState } from 'src/store/types'

const getGlyphCharacterById = (
  fontData: FontData | null | undefined,
  glyphId: string
) => {
  const unicode = fontData?.glyphs[glyphId]?.unicode
  if (!unicode) {
    return ''
  }

  const codePoint = Number.parseInt(unicode, 16)
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : ''
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
