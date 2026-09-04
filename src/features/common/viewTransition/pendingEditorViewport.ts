interface FontRect {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

let _pendingRect: FontRect | null = null

export function setPendingEditorViewportRect(rect: FontRect): void {
  _pendingRect = rect
}

export function consumePendingEditorViewportRect(): FontRect | null {
  const rect = _pendingRect
  _pendingRect = null
  return rect
}
