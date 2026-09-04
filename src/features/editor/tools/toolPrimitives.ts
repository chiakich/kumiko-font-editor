import type { EventStream, ToolEvent } from '@/features/editor/tools/BaseTool'

export interface ToolPoint {
  x: number
  y: number
}

export async function* asyncEventIterator(
  eventStream: EventStream
): AsyncGenerator<ToolEvent, void, unknown> {
  while (true) {
    const event = await eventStream.next()
    if (event === undefined) {
      break
    }
    yield event
  }
}

export function constrainHorizontalVerticalDiagonal(
  origin: ToolPoint,
  point: ToolPoint
): ToolPoint {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  if (Math.abs(dx) > Math.abs(dy) * 2) {
    return { x: point.x, y: origin.y }
  }
  if (Math.abs(dy) > Math.abs(dx) * 2) {
    return { x: origin.x, y: point.y }
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: origin.x + Math.sign(dx || 1) * size,
    y: origin.y + Math.sign(dy || 1) * size,
  }
}
