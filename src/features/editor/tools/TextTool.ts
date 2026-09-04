import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from '@/features/editor/tools/BaseTool'
import { asyncEventIterator } from '@/features/editor/tools/toolPrimitives'

export class TextTool extends BaseTool {
  identifier = 'text'

  override activate(): void {
    this.setCursor('text')
    this.canvasController.requestUpdate()
  }

  override deactivate(): void {
    super.deactivate()
    this.canvasController.requestUpdate()
  }

  override handleHover(): void {
    this.setCursor('text')
  }

  async handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void> {
    initialEvent.preventDefault()
    for await (const event of asyncEventIterator(eventStream)) {
      event.preventDefault()
    }
  }
}
