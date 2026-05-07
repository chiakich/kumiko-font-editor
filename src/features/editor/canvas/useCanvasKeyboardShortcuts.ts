import { useEffect, type RefObject } from 'react'
import { getGlyphLayer, type FontData } from '../../../store'
import type { ToolId } from './workspace/types'

interface UseCanvasKeyboardShortcutsOptions {
  activeEditorGlyphId: string | null
  activeToolId: ToolId
  deleteSelectedNodes: (glyphId: string, nodeIds: string[]) => void
  fontData: FontData | null
  getPreviousPenSelection: () => string | null
  onCopySelection: () => Promise<void>
  onCutSelection: () => Promise<void>
  onPasteSelection: () => Promise<void>
  onRedo: () => void
  onSelectTool: (toolId: ToolId) => void
  onUndo: () => void
  selectedLayerId: string | null
  selectedNodeIds: string[]
  setSelectedNodeIds: (ids: string[]) => void
  setSelectedSegment: (segment: null) => void
  temporaryToolRef: RefObject<ToolId | null>
  updateNodePositions: (
    glyphId: string,
    updates: Array<{
      pathId: string
      nodeId: string
      newPos: { x: number; y: number }
    }>
  ) => void
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

export function useCanvasKeyboardShortcuts({
  activeEditorGlyphId,
  activeToolId,
  deleteSelectedNodes,
  fontData,
  getPreviousPenSelection,
  onCopySelection,
  onCutSelection,
  onPasteSelection,
  onRedo,
  onSelectTool,
  onUndo,
  selectedLayerId,
  selectedNodeIds,
  setSelectedNodeIds,
  setSelectedSegment,
  temporaryToolRef,
  updateNodePositions,
}: UseCanvasKeyboardShortcutsOptions) {
  useEffect(() => {
    const activeGlyph =
      activeEditorGlyphId && fontData
        ? fontData.glyphs[activeEditorGlyphId]
        : null
    const activeLayer = activeGlyph
      ? getGlyphLayer(activeGlyph, selectedLayerId)
      : null

    const selectAllGlyphNodes = () => {
      if (activeToolId === 'text' || !activeLayer) {
        return
      }

      const allNodeIds = activeLayer.paths.flatMap((path) =>
        path.nodes.map((node) => `${path.id}:${node.id}`)
      )
      setSelectedSegment(null)
      setSelectedNodeIds(allNodeIds)
    }

    const nudgeSelectedNodes = (dx: number, dy: number) => {
      if (activeToolId === 'text') {
        return
      }
      if (
        !activeEditorGlyphId ||
        !activeLayer ||
        selectedNodeIds.length === 0
      ) {
        return
      }

      const updates = selectedNodeIds.flatMap((selectedNodeId) => {
        const [pathId, nodeId] = selectedNodeId.split(':')
        const path = activeLayer.paths.find(
          (candidate) => candidate.id === pathId
        )
        const node = path?.nodes.find((candidate) => candidate.id === nodeId)
        if (!path || !node) {
          return []
        }

        return [
          {
            pathId,
            nodeId,
            newPos: {
              x: node.x + dx,
              y: node.y + dy,
            },
          },
        ]
      })

      if (updates.length > 0) {
        updateNodePositions(activeEditorGlyphId, updates)
      }
    }

    const selectToolByKey = (event: KeyboardEvent, toolId: ToolId) => {
      event.preventDefault()
      temporaryToolRef.current = null
      onSelectTool(toolId)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
      }

      if (isTypingTarget(event.target)) {
        return
      }

      if (event.metaKey || event.ctrlKey) {
        if (event.key === 'z' && !event.shiftKey) {
          event.preventDefault()
          onUndo()
        } else if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
          event.preventDefault()
          onRedo()
        } else if (event.key === 'c' || event.key === 'C') {
          event.preventDefault()
          void onCopySelection()
        } else if (event.key === 'x' || event.key === 'X') {
          event.preventDefault()
          void onCutSelection()
        } else if (event.key === 'v' || event.key === 'V') {
          event.preventDefault()
          void onPasteSelection()
        } else if (event.key === 'a' || event.key === 'A') {
          event.preventDefault()
          event.stopPropagation()
          selectAllGlyphNodes()
        }
      } else if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        activeEditorGlyphId &&
        selectedNodeIds.length > 0
      ) {
        event.preventDefault()
        const nextPenSelection = getPreviousPenSelection()
        deleteSelectedNodes(activeEditorGlyphId, selectedNodeIds)
        if (nextPenSelection) {
          setSelectedNodeIds([nextPenSelection])
        }
      } else if (event.key === 'v' || event.key === 'V') {
        selectToolByKey(event, 'pointer')
      } else if (event.key === 'p' || event.key === 'P') {
        selectToolByKey(event, 'pen')
      } else if (event.key === 'b' || event.key === 'B') {
        selectToolByKey(event, 'brush')
      } else if (event.key === 'r' || event.key === 'R') {
        selectToolByKey(event, 'shape-rect')
      } else if (event.key === 'o' || event.key === 'O') {
        selectToolByKey(event, 'shape-ellipse')
      } else if (event.key === 'k' || event.key === 'K') {
        selectToolByKey(event, 'knife')
      } else if (event.key === 'h' || event.key === 'H') {
        selectToolByKey(event, 'hand')
      } else if (event.key === 't' || event.key === 'T') {
        selectToolByKey(event, 'text')
      } else if (selectedNodeIds.length > 0 && event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        nudgeSelectedNodes(-1, 0)
      } else if (selectedNodeIds.length > 0 && event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        nudgeSelectedNodes(1, 0)
      } else if (selectedNodeIds.length > 0 && event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        nudgeSelectedNodes(0, 1)
      } else if (selectedNodeIds.length > 0 && event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        nudgeSelectedNodes(0, -1)
      } else if (event.key === ' ' && !event.repeat) {
        event.preventDefault()
        if (!temporaryToolRef.current) {
          temporaryToolRef.current = activeToolId
          onSelectTool('hand')
        }
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
      }

      if (event.key !== ' ' || !temporaryToolRef.current) {
        return
      }

      const previousTool = temporaryToolRef.current
      temporaryToolRef.current = null
      onSelectTool(previousTool)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [
    activeEditorGlyphId,
    activeToolId,
    deleteSelectedNodes,
    fontData,
    getPreviousPenSelection,
    onCopySelection,
    onCutSelection,
    onPasteSelection,
    onRedo,
    onSelectTool,
    onUndo,
    selectedLayerId,
    selectedNodeIds,
    setSelectedNodeIds,
    setSelectedSegment,
    temporaryToolRef,
    updateNodePositions,
  ])
}
