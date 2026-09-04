import { describe, expect, it, vi } from 'vitest'
import { createWorkerRpcClient } from '@/lib/workers/createWorkerRpcClient'

type Response =
  | { type: 'ok'; requestId: number; value: string }
  | { type: 'fail'; requestId: number; message: string }

class FakeWorker {
  listeners = new Map<string, Set<(event: unknown) => void>>()
  posted: unknown[] = []
  terminated = false
  postMessageImpl: ((message: unknown) => void) | null = null

  addEventListener(type: string, listener: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  postMessage(message: unknown) {
    this.posted.push(message)
    this.postMessageImpl?.(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event)
    }
  }

  reply(data: Response) {
    this.emit('message', { data })
  }
}

const setup = () => {
  const workers: FakeWorker[] = []
  const client = createWorkerRpcClient<Response>({
    createWorker: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    },
    getRequestId: (response) => response.requestId,
    toOutcome: (response) =>
      response.type === 'ok'
        ? { status: 'success', value: response.value }
        : { status: 'error', error: new Error(response.message) },
    workerErrorMessage: 'fake worker failed',
  })
  return { client, workers }
}

describe('createWorkerRpcClient', () => {
  it('routes replies to the matching request and reuses one worker', async () => {
    const { client, workers } = setup()

    const first = client.request<string>((requestId) => ({ requestId }))
    const second = client.request<string>((requestId) => ({ requestId }))
    expect(workers).toHaveLength(1)

    const [worker] = workers
    const ids = worker.posted.map(
      (message) => (message as { requestId: number }).requestId
    )
    expect(new Set(ids).size).toBe(2)

    // Reply out of order to prove the pending map, not arrival order, decides.
    worker.reply({ type: 'ok', requestId: ids[1], value: 'second' })
    worker.reply({ type: 'ok', requestId: ids[0], value: 'first' })

    await expect(first).resolves.toBe('first')
    await expect(second).resolves.toBe('second')
  })

  it('rejects only the failing request', async () => {
    const { client, workers } = setup()
    const pending = client.request<string>((requestId) => ({ requestId }))
    const other = client.request<string>((requestId) => ({ requestId }))
    const [worker] = workers
    const ids = worker.posted.map(
      (message) => (message as { requestId: number }).requestId
    )

    worker.reply({ type: 'fail', requestId: ids[0], message: 'nope' })
    await expect(pending).rejects.toThrow('nope')

    worker.reply({ type: 'ok', requestId: ids[1], value: 'still fine' })
    await expect(other).resolves.toBe('still fine')
  })

  it('ignores replies with an unknown request id', async () => {
    const { client, workers } = setup()
    const pending = client.request<string>((requestId) => ({ requestId }))
    const [worker] = workers
    const id = (worker.posted[0] as { requestId: number }).requestId

    worker.reply({ type: 'ok', requestId: id + 999, value: 'stray' })
    worker.reply({ type: 'ok', requestId: id, value: 'mine' })
    await expect(pending).resolves.toBe('mine')
  })

  it('fails everything in flight on a worker-level error and rebuilds next call', async () => {
    const { client, workers } = setup()
    const first = client.request<string>((requestId) => ({ requestId }))
    const second = client.request<string>((requestId) => ({ requestId }))

    workers[0].emit('error', { message: 'boom' })
    await expect(first).rejects.toThrow('boom')
    await expect(second).rejects.toThrow('boom')
    expect(workers[0].terminated).toBe(true)

    const third = client.request<string>((requestId) => ({ requestId }))
    expect(workers).toHaveLength(2)
    const id = (workers[1].posted[0] as { requestId: number }).requestId
    workers[1].reply({ type: 'ok', requestId: id, value: 'recovered' })
    await expect(third).resolves.toBe('recovered')
  })

  it('ignores an error queued from a worker that was already replaced', async () => {
    const { client, workers } = setup()
    const first = client.request<string>((requestId) => ({ requestId }))

    workers[0].emit('error', { message: 'boom' })
    await expect(first).rejects.toThrow('boom')

    // The replacement is built here; a second error event from the dead worker
    // must not kill it or reject the request that just went out.
    const second = client.request<string>((requestId) => ({ requestId }))
    expect(workers).toHaveLength(2)
    workers[0].emit('error', { message: 'boom again' })

    expect(workers[1].terminated).toBe(false)
    const id = (workers[1].posted[0] as { requestId: number }).requestId
    workers[1].reply({ type: 'ok', requestId: id, value: 'survived' })
    await expect(second).resolves.toBe('survived')
  })

  it('rejects when postMessage throws without leaving the request pending', async () => {
    const { client, workers } = setup()
    const first = client.request<string>((requestId) => ({ requestId }))
    const [worker] = workers
    worker.postMessageImpl = () => {
      throw new Error('clone failed')
    }

    await expect(
      client.request<string>((requestId) => ({ requestId }))
    ).rejects.toThrow('clone failed')

    worker.postMessageImpl = null
    const id = (worker.posted[0] as { requestId: number }).requestId
    worker.reply({ type: 'ok', requestId: id, value: 'unaffected' })
    await expect(first).resolves.toBe('unaffected')
  })

  it('aborts a request, notifies the worker, and ignores its late reply', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const onAbort = vi.fn((requestId: number, worker: Worker) => {
      worker.postMessage({ type: 'cancel', requestId })
    })
    const pending = client.request<string>((requestId) => ({ requestId }), {
      signal: controller.signal,
      abortReason: 'Search aborted',
      onAbort,
    })
    const [worker] = workers
    const id = (worker.posted[0] as { requestId: number }).requestId

    controller.abort()
    await expect(pending).rejects.toThrow('Search aborted')
    expect(onAbort).toHaveBeenCalledWith(id, worker)
    expect(worker.posted.at(-1)).toEqual({ type: 'cancel', requestId: id })

    // A reply that lands after the abort must not throw on a cleared entry.
    expect(() =>
      worker.reply({ type: 'ok', requestId: id, value: 'late' })
    ).not.toThrow()
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const { client, workers } = setup()
    await expect(
      client.request<string>((requestId) => ({ requestId }), {
        signal: AbortSignal.abort(),
      })
    ).rejects.toThrow()
    expect(workers).toHaveLength(0)
  })

  it('post() sends a fire-and-forget message on the shared worker', () => {
    const { client, workers } = setup()
    client.post({ type: 'prewarm' })
    expect(workers).toHaveLength(1)
    expect(workers[0].posted).toEqual([{ type: 'prewarm' }])
  })
})
