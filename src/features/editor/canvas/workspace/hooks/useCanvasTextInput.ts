import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import type { PositionedGlyph } from '@/sceneView'
import type { FontData, ViewportState } from '@/store'
import type { ToolId } from '@/features/editor/canvas/workspace/types'
import {
  buildTextInputCommitPlan,
  buildGlyphIdByCharacter,
  charIndexToCodeUnitIndex,
  codeUnitIndexToCharIndex,
} from '@/features/editor/canvas/workspace/layout/textInput'

interface CanvasTextInputOptions {
  activeToolId: ToolId
  addGlyphs: (
    glyphs: Array<{
      id: string
      name: string
      unicode: string | null
      production?: string | null
      width?: number
    }>
  ) => string[]
  canvasSize: { width: number; height: number }
  editorGlyphIds: string[]
  editorText: string
  editorTextCursorIndex: number
  fontData: FontData | null
  inputRef: RefObject<HTMLTextAreaElement | null>
  positionedGlyphs: PositionedGlyph[]
  setEditorActiveGlyphIndex: (index: number) => void
  setEditorTextCursorIndex: (index: number) => void
  setEditorTextState: (
    text: string,
    glyphIds: string[],
    cursorIndex: number,
    activeGlyphIndex?: number
  ) => void
  viewport: ViewportState
}

export function useCanvasTextInput({
  activeToolId,
  addGlyphs,
  canvasSize,
  editorGlyphIds,
  editorText,
  editorTextCursorIndex,
  fontData,
  inputRef,
  positionedGlyphs,
  setEditorActiveGlyphIndex,
  setEditorTextCursorIndex,
  setEditorTextState,
  viewport,
}: CanvasTextInputOptions) {
  const [draftTextInputValue, setDraftTextInputValue] = useState('')
  const [isComposingText, setIsComposingText] = useState(false)
  const [compositionText, setCompositionText] = useState('')
  const glyphIdByCharacter = useMemo(
    () => buildGlyphIdByCharacter(fontData),
    [fontData]
  )
  const textInputValue = isComposingText ? draftTextInputValue : editorText

  const commitTextInputValue = useCallback(
    (value: string, selectionStart: number | null) => {
      const commitPlan = buildTextInputCommitPlan({
        fontData,
        glyphIdByCharacter,
        selectionStart,
        value,
      })
      if (commitPlan.glyphsToAdd.length > 0) {
        addGlyphs(commitPlan.glyphsToAdd)
      }
      setEditorTextState(
        commitPlan.text,
        commitPlan.glyphIds,
        commitPlan.cursorIndex,
        commitPlan.activeGlyphIndex
      )
      setDraftTextInputValue(commitPlan.text)
    },
    [addGlyphs, fontData, glyphIdByCharacter, setEditorTextState]
  )

  const getCursorX = useCallback(
    (cursorIndex: number) => {
      for (const positionedGlyph of positionedGlyphs) {
        const startIndex = positionedGlyph.sourceStartIndex ?? 0
        const length = positionedGlyph.sourceLength ?? 1
        const endIndex = startIndex + length
        if (cursorIndex === startIndex) {
          return positionedGlyph.x
        }
        if (cursorIndex > startIndex && cursorIndex < endIndex) {
          return (
            positionedGlyph.x +
            positionedGlyph.glyph.xAdvance *
              ((cursorIndex - startIndex) / length)
          )
        }
        if (cursorIndex === endIndex) {
          return positionedGlyph.x + positionedGlyph.glyph.xAdvance
        }
      }

      const previousGlyph = positionedGlyphs.at(-1)
      return previousGlyph ? previousGlyph.x + previousGlyph.glyph.xAdvance : 0
    },
    [positionedGlyphs]
  )

  const compositionOverlayStyle = useMemo(() => {
    if (
      activeToolId !== 'text' ||
      !isComposingText ||
      !compositionText ||
      canvasSize.width === 0
    ) {
      return null
    }

    return {
      left:
        canvasSize.width / 2 +
        viewport.pan.x +
        getCursorX(editorTextCursorIndex) * viewport.zoom,
      top: canvasSize.height / 2 + viewport.pan.y - 28,
    }
  }, [
    activeToolId,
    canvasSize.height,
    canvasSize.width,
    compositionText,
    editorTextCursorIndex,
    getCursorX,
    isComposingText,
    viewport.pan.x,
    viewport.pan.y,
    viewport.zoom,
  ])

  useEffect(() => {
    if (activeToolId !== 'text') {
      return
    }

    const input = inputRef.current
    if (!input) {
      return
    }

    const selectionOffset = charIndexToCodeUnitIndex(
      textInputValue,
      editorTextCursorIndex
    )
    input.focus()
    input.setSelectionRange(selectionOffset, selectionOffset)
  }, [activeToolId, editorTextCursorIndex, inputRef, textInputValue])

  const handleTextInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftTextInputValue(event.target.value)
      if (!isComposingText) {
        commitTextInputValue(event.target.value, event.target.selectionStart)
      }
    },
    [commitTextInputValue, isComposingText]
  )

  const handleTextInputCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLTextAreaElement>) => {
      setIsComposingText(false)
      setCompositionText('')
      setDraftTextInputValue(event.currentTarget.value)
      commitTextInputValue(
        event.currentTarget.value,
        event.currentTarget.selectionStart
      )
    },
    [commitTextInputValue]
  )

  const handleTextInputCompositionStart = useCallback(() => {
    setDraftTextInputValue(textInputValue)
    setIsComposingText(true)
  }, [textInputValue])

  const handleTextInputCompositionUpdate = useCallback(
    (event: CompositionEvent<HTMLTextAreaElement>) => {
      setCompositionText(event.data)
    },
    []
  )

  const handleTextInputSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      if (activeToolId !== 'text') {
        return
      }
      const target = event.target as HTMLTextAreaElement
      const cursorIndex = codeUnitIndexToCharIndex(
        target.value,
        target.selectionStart ?? target.value.length
      )
      setEditorTextCursorIndex(cursorIndex)
      if (editorGlyphIds.length > 0) {
        setEditorActiveGlyphIndex(
          Math.max(0, Math.min(cursorIndex - 1, editorGlyphIds.length - 1))
        )
      }
    },
    [
      activeToolId,
      editorGlyphIds.length,
      setEditorActiveGlyphIndex,
      setEditorTextCursorIndex,
    ]
  )

  return {
    compositionOverlayStyle,
    compositionText,
    getCursorX,
    handleTextInputChange,
    handleTextInputCompositionEnd,
    handleTextInputCompositionStart,
    handleTextInputCompositionUpdate,
    handleTextInputSelect,
    textInputValue,
  }
}
