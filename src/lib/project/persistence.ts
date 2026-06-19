const DB_NAME = 'kumiko-font-editor'
const DB_VERSION = 10

export const KUMIKO_PROJECTS_STORE = 'kumiko_projects'
export const KUMIKO_GLYPHS_STORE = 'kumiko_glyphs'
export const KUMIKO_UI_STATE_STORE = 'kumiko_ui_state'

const createKumikoStores = (database: IDBDatabase) => {
  database.createObjectStore(KUMIKO_PROJECTS_STORE, {
    keyPath: 'projectId',
  })

  const glyphStore = database.createObjectStore(KUMIKO_GLYPHS_STORE, {
    keyPath: ['projectId', 'glyphId'],
  })
  glyphStore.createIndex('byProject', 'projectId', { unique: false })
  glyphStore.createIndex('byProjectExportDirty', ['projectId', 'exportDirty'], {
    unique: false,
  })
  glyphStore.createIndex('byProjectSyncDirty', ['projectId', 'syncDirty'], {
    unique: false,
  })
  glyphStore.createIndex('byUnicodeKey', 'unicodeKeys', {
    unique: false,
    multiEntry: true,
  })
  glyphStore.createIndex('byDisplayName', ['projectId', 'displayName'], {
    unique: false,
  })
  glyphStore.createIndex('byComponentRefKey', 'componentRefKeys', {
    unique: false,
    multiEntry: true,
  })

  database.createObjectStore(KUMIKO_UI_STATE_STORE, {
    keyPath: ['projectId', 'key'],
  })
}

export const openDatabase = async () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      for (const storeName of Array.from(database.objectStoreNames)) {
        database.deleteObjectStore(storeName)
      }
      createKumikoStores(database)
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
