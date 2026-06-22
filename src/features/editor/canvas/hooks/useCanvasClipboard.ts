import { useCallback } from 'react'
import type { FontData, SelectedSegmentState } from 'src/store'
import { useStore } from 'src/store'
import {
  buildClipboardPayloadFromSelection,
  materializeClipboardPaths,
  parseClipboardPathsText,
  serializeClipboardPathsAsSvg,
} from 'src/features/editor/canvas/utils/clipboardPaths'

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

    await writeClipboardSvg(serializeClipboardPathsAsSvg(payload))
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

async function writeClipboardSvg(svgText: string | null) {
  if (!svgText) {
    return
  }

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' })
    const htmlBlob = new Blob([svgText], { type: 'text/html' })
    const plainTextBlob = new Blob([svgText], { type: 'text/plain' })
    const richTypes: Record<string, Blob> = {
      'text/plain': plainTextBlob,
      'text/html': htmlBlob,
    }

    if (canWriteClipboardType('image/svg+xml')) {
      richTypes['image/svg+xml'] = svgBlob
    }

    try {
      await navigator.clipboard.write([new ClipboardItem(richTypes)])
      return
    } catch {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': plainTextBlob,
            'text/html': htmlBlob,
          }),
        ])
        return
      } catch {
        // Fall through to plain SVG text. Kumiko can parse it back on paste.
      }
    }
  }

  await navigator.clipboard.writeText(svgText)
}

function canWriteClipboardType(type: string) {
  return (
    typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports(type)
  )
}
