import {
  KUMIKO_UI_STATE_STORE,
  openDatabase,
} from 'src/lib/project/persistence'

const LOCK_KEY = 'projectWriteLock'
const LOCK_CHANNEL_NAME = 'kumiko-project-locks'
export const PROJECT_WRITE_LOCK_TTL_MS = 15_000
export const PROJECT_WRITE_LOCK_HEARTBEAT_MS = 5_000

export interface ProjectWriteLockRecord {
  ownerId: string
  acquiredAt: number
  expiresAt: number
}

const ownerId =
  globalThis.crypto?.randomUUID?.() ??
  `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

const publishLockChange = (
  projectId: string,
  action: 'acquired' | 'released'
) => {
  if (!('BroadcastChannel' in globalThis)) {
    return
  }
  const channel = new BroadcastChannel(LOCK_CHANNEL_NAME)
  channel.postMessage({ projectId, action, ownerId })
  channel.close()
}

export const acquireProjectWriteLock = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_UI_STATE_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_UI_STATE_STORE)
  const key = [projectId, LOCK_KEY]
  const existing = (await requestToPromise(store.get(key))) as
    | { value?: ProjectWriteLockRecord }
    | undefined
  const currentLock = existing?.value
  const now = Date.now()

  if (
    currentLock &&
    currentLock.ownerId !== ownerId &&
    currentLock.expiresAt > now
  ) {
    await transactionDone(transaction)
    return { acquired: false, lock: currentLock }
  }

  const nextLock: ProjectWriteLockRecord = {
    ownerId,
    acquiredAt: now,
    expiresAt: now + PROJECT_WRITE_LOCK_TTL_MS,
  }
  store.put({ projectId, key: LOCK_KEY, value: nextLock })
  await transactionDone(transaction)
  publishLockChange(projectId, 'acquired')
  return { acquired: true, lock: nextLock }
}

export const releaseProjectWriteLock = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_UI_STATE_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_UI_STATE_STORE)
  const key = [projectId, LOCK_KEY]
  const existing = (await requestToPromise(store.get(key))) as
    | { value?: ProjectWriteLockRecord }
    | undefined

  if (existing?.value?.ownerId === ownerId) {
    store.delete(key)
  }

  await transactionDone(transaction)
  publishLockChange(projectId, 'released')
}

export const renewProjectWriteLock = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_UI_STATE_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_UI_STATE_STORE)
  const key = [projectId, LOCK_KEY]
  const existing = (await requestToPromise(store.get(key))) as
    | { value?: ProjectWriteLockRecord }
    | undefined
  const currentLock = existing?.value
  const now = Date.now()

  if (currentLock && currentLock.ownerId !== ownerId) {
    await transactionDone(transaction)
    return false
  }

  store.put({
    projectId,
    key: LOCK_KEY,
    value: {
      ownerId,
      acquiredAt: currentLock?.acquiredAt ?? now,
      expiresAt: now + PROJECT_WRITE_LOCK_TTL_MS,
    },
  })
  await transactionDone(transaction)
  return true
}
