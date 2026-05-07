import type { EventStream, ToolEvent } from 'src/features/editor/tools/BaseTool'

export async function* asyncEventIterator(
  eventStream: EventStream
): AsyncGenerator<ToolEvent, void, unknown> {
  while (true) {
    const event = await eventStream.next()
    if (event === undefined) break
    yield event
  }
}
