import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'

export class HandTool extends BaseTool {
  identifier = 'hand'

  override activate(): void {
    this.setCursor('grab')
    this.canvasController.requestUpdate()
  }

  override deactivate(): void {
    super.deactivate()
    this.canvasController.requestUpdate()
  }

  handleHover(): void {
    this.setCursor('grab')
  }

  async handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void> {
    initialEvent.preventDefault()
    this.setCursor('grabbing')

    let previousEvent = initialEvent
    for await (const event of asyncEventIterator(eventStream)) {
      event.preventDefault()
      this.canvasController.panBy(
        event.x - previousEvent.x,
        event.y - previousEvent.y
      )
      previousEvent = event
    }

    this.setCursor('grab')
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
