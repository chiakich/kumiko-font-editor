import {
  CursorPointer,
  DragHandGesture,
  EditPencil,
  DesignNib,
  Scissor,
  Square,
  Text,
  Circle,
} from 'iconoir-react'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'

type ToolIcon = typeof CursorPointer

export const TOOL_ICONS: Record<ToolId, ToolIcon> = {
  pointer: CursorPointer,
  pen: DesignNib,
  brush: EditPencil,
  'shape-rect': Square,
  'shape-ellipse': Circle,
  knife: Scissor,
  text: Text,
  hand: DragHandGesture,
}
