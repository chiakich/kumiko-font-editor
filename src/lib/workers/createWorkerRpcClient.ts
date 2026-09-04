export type WorkerRpcRequestId = string | number

export type WorkerRpcOutcome =
  | { status: 'success'; value: unknown }
  | { status: 'error'; error: Error }

export interface WorkerRpcClientOptions<
  Response,
  Id extends WorkerRpcRequestId = number,
> {
  createWorker: () => Worker
  // Returning undefined means the message is not a reply to a pending request.
  getRequestId: (response: Response) => Id | undefined
  toOutcome: (response: Response) => WorkerRpcOutcome
  createRequestId?: (sequence: number) => Id
  workerErrorMessage?: string
}

export interface WorkerRpcRequestOptions<Id extends WorkerRpcRequestId> {
  transfer?: Transferable[]
  signal?: AbortSignal
  // Lets the caller tell the worker to drop the work it already started.
  onAbort?: (requestId: Id, worker: Worker) => void
  abortReason?: string
}

export interface WorkerRpcClient<Id extends WorkerRpcRequestId> {
  request: <Result>(
    buildMessage: (requestId: Id) => unknown,
    options?: WorkerRpcRequestOptions<Id>
  ) => Promise<Result>
  // Fire-and-forget message with no reply, e.g. warming a runtime up.
  post: (message: unknown) => void
}

interface PendingRequest {
  resolve: (value: never) => void
  reject: (error: Error) => void
  detach: () => void
}

const toError = (error: unknown, fallbackMessage: string) =>
  error instanceof Error ? error : new Error(fallbackMessage)

export const createWorkerRpcClient = <
  Response,
  Id extends WorkerRpcRequestId = number,
>(
  options: WorkerRpcClientOptions<Response, Id>
): WorkerRpcClient<Id> => {
  const {
    createWorker,
    getRequestId,
    toOutcome,
    createRequestId = (sequence: number) => sequence as Id,
    workerErrorMessage = 'Worker failed.',
  } = options

  const pendingRequests = new Map<Id, PendingRequest>()
  let workerInstance: Worker | null = null
  let sequence = 0

  const failAllPending = (error: Error) => {
    const entries = [...pendingRequests.values()]
    pendingRequests.clear()
    for (const entry of entries) {
      entry.detach()
      entry.reject(error)
    }
  }

  const getWorker = () => {
    if (workerInstance) {
      return workerInstance
    }
    const worker = createWorker()
    worker.addEventListener('message', (event: MessageEvent<Response>) => {
      const requestId = getRequestId(event.data)
      if (requestId === undefined) {
        return
      }
      const pending = pendingRequests.get(requestId)
      if (!pending) {
        return
      }
      pendingRequests.delete(requestId)
      pending.detach()
      const outcome = toOutcome(event.data)
      if (outcome.status === 'success') {
        pending.resolve(outcome.value as never)
        return
      }
      pending.reject(outcome.error)
    })
    // A worker-level error means the runtime itself is broken, not one request:
    // fail everything in flight and start fresh on the next call. Errors queued
    // from an already-replaced worker are ignored, or a second one would kill
    // the replacement and reject its requests with the dead worker's message.
    worker.addEventListener('error', (event) => {
      if (workerInstance !== worker) {
        return
      }
      worker.terminate()
      workerInstance = null
      failAllPending(new Error(event.message || workerErrorMessage))
    })
    workerInstance = worker
    return worker
  }

  const request = <Result>(
    buildMessage: (requestId: Id) => unknown,
    requestOptions: WorkerRpcRequestOptions<Id> = {}
  ) =>
    new Promise<Result>((resolve, reject) => {
      const { signal, transfer, onAbort, abortReason } = requestOptions
      if (signal?.aborted) {
        reject(new DOMException(abortReason ?? 'Request aborted', 'AbortError'))
        return
      }

      sequence += 1
      const requestId = createRequestId(sequence)

      let worker: Worker
      try {
        worker = getWorker()
      } catch (error) {
        reject(toError(error, workerErrorMessage))
        return
      }

      const detach = () => signal?.removeEventListener('abort', handleAbort)
      const handleAbort = () => {
        pendingRequests.delete(requestId)
        onAbort?.(requestId, worker)
        reject(new DOMException(abortReason ?? 'Request aborted', 'AbortError'))
      }

      pendingRequests.set(requestId, {
        resolve: resolve as (value: never) => void,
        reject,
        detach,
      })
      signal?.addEventListener('abort', handleAbort, { once: true })

      try {
        worker.postMessage(buildMessage(requestId), transfer ?? [])
      } catch (error) {
        pendingRequests.delete(requestId)
        detach()
        reject(toError(error, workerErrorMessage))
      }
    })

  return {
    request,
    post: (message: unknown) => {
      getWorker().postMessage(message)
    },
  }
}
