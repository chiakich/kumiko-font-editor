import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'

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

async function* asyncEventIterator(
  eventStream: EventStream
): AsyncGenerator<ToolEvent, void> {
  while (true) {
    const value = await eventStream.next()
    if (!value) {
      break
    }
    yield value
  }
}
