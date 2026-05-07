import { useCallback } from 'react'
import type { FontData, SelectedSegmentState } from '../../../store'
import { useStore } from '../../../store'
import {
  buildClipboardPayloadFromSelection,
  materializeClipboardPaths,
  parseClipboardPathsText,
  serializeClipboardPaths,
} from './clipboardPaths'

interface UseCanvasClipboardOptions {
  activeEditorGlyphId: string | null
  deleteSelectedNodes: (glyphId: string, nodeIds: string[]) => void
  fontData: FontData | null
  selectedNodeIds: string[]
  selectedSegment: SelectedSegmentState | null
  setSelectedNodeIds: (ids: string[]) => void
}

export function useCanvasClipboard({
  activeEditorGlyphId,
  deleteSelectedNodes,
  fontData,
  selectedNodeIds,
  selectedSegment,
  setSelectedNodeIds,
}: UseCanvasClipboardOptions) {
  const copySelection = useCallback(async () => {
    if (!fontData || !activeEditorGlyphId) {
      return
    }

    const glyph = fontData.glyphs[activeEditorGlyphId]
    if (!glyph) {
      return
    }

    const payload = buildClipboardPayloadFromSelection(
      glyph,
      selectedNodeIds,
      selectedSegment
    )
    if (!payload) {
      return
    }

    await navigator.clipboard.writeText(serializeClipboardPaths(payload))
  }, [activeEditorGlyphId, fontData, selectedNodeIds, selectedSegment])

  const cutSelection = useCallback(async () => {
    if (!activeEditorGlyphId || selectedNodeIds.length === 0) {
      return
    }

    await copySelection()
    deleteSelectedNodes(activeEditorGlyphId, selectedNodeIds)
  }, [activeEditorGlyphId, copySelection, deleteSelectedNodes, selectedNodeIds])

  const pasteSelection = useCallback(async () => {
    if (!activeEditorGlyphId) {
      return
    }

    const clipboardText = await navigator.clipboard.readText()
    const payload = parseClipboardPathsText(clipboardText)
    if (!payload) {
      return
    }

    const paths = materializeClipboardPaths(payload)
    if (!paths.length) {
      return
    }

    const store = useStore.getState()
    for (const path of paths) {
      store.createPath(activeEditorGlyphId, path)
    }

    setSelectedNodeIds(
      paths.flatMap((path) => path.nodes.map((node) => `${path.id}:${node.id}`))
    )
  }, [activeEditorGlyphId, setSelectedNodeIds])

  return {
    copySelection,
    cutSelection,
    pasteSelection,
  }
}
