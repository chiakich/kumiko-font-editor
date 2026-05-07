import {
  openDatabase,
  UFO_GLYPHS_STORE,
  UFO_METADATA_STORE,
  UFO_PROJECTS_STORE,
  UFO_UI_STATE_STORE,
} from 'src/lib/persistence'
import type {
  UfoGlyphPrimaryKey,
  UfoGlyphRecord,
  UfoMetadataRecord,
  UfoProjectRecord,
  UfoUiStateRecord,
} from 'src/lib/ufoTypes'

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

export const makeUfoGlyphKey = (
  projectId: string,
  ufoId: string,
  layerId: string,
  glyphName: string
): UfoGlyphPrimaryKey => [projectId, ufoId, layerId, glyphName]

export const saveUfoProject = async (record: UfoProjectRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_PROJECTS_STORE, 'readwrite')
  transaction.objectStore(UFO_PROJECTS_STORE).put(record)
  await transactionDone(transaction)
}

export const loadUfoProject = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_PROJECTS_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(UFO_PROJECTS_STORE).get(projectId)
  ) as Promise<UfoProjectRecord | undefined>
}

export const saveUfoMetadata = async (record: UfoMetadataRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_METADATA_STORE, 'readwrite')
  transaction.objectStore(UFO_METADATA_STORE).put(record)
  await transactionDone(transaction)
}

export const saveUfoMetadataBatch = async (records: UfoMetadataRecord[]) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_METADATA_STORE, 'readwrite')
  const store = transaction.objectStore(UFO_METADATA_STORE)
  for (const record of records) {
    store.put(record)
  }
  await transactionDone(transaction)
}

export const loadUfoMetadata = async (projectId: string, ufoId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_METADATA_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(UFO_METADATA_STORE).get([projectId, ufoId])
  ) as Promise<UfoMetadataRecord | undefined>
}

export const listUfoMetadataForProject = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_METADATA_STORE, 'readonly')
  const store = transaction.objectStore(UFO_METADATA_STORE)
  const results = (await requestToPromise(
    store.getAll()
  )) as UfoMetadataRecord[]
  return results.filter((record) => record.projectId === projectId)
}

export const saveUfoGlyph = async (record: UfoGlyphRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readwrite')
  transaction.objectStore(UFO_GLYPHS_STORE).put(record)
  await transactionDone(transaction)
}

export const saveUfoGlyphBatch = async (records: UfoGlyphRecord[]) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(UFO_GLYPHS_STORE)
  for (const record of records) {
    store.put(record)
  }
  await transactionDone(transaction)
}

export const deleteUfoGlyphBatch = async (keys: UfoGlyphPrimaryKey[]) => {
  if (keys.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(UFO_GLYPHS_STORE)
  for (const key of keys) {
    store.delete(key)
  }
  await transactionDone(transaction)
}

export const updateUfoGlyphDirtyState = async (
  keys: UfoGlyphPrimaryKey[],
  dirty: boolean
) => {
  if (keys.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(UFO_GLYPHS_STORE)

  for (const key of keys) {
    const record = (await requestToPromise(store.get(key))) as
      | UfoGlyphRecord
      | undefined
    if (!record) {
      continue
    }
    store.put({
      ...record,
      dirty,
      dirtyIndex: dirty ? 1 : 0,
      updatedAt: Date.now(),
    })
  }

  await transactionDone(transaction)
}

export const updateUfoGlyphExportState = async (
  updates: Array<{
    key: UfoGlyphPrimaryKey
    dirty: boolean
    sourceHash: string | null
  }>
) => {
  if (updates.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(UFO_GLYPHS_STORE)

  for (const update of updates) {
    const record = (await requestToPromise(store.get(update.key))) as
      | UfoGlyphRecord
      | undefined
    if (!record) {
      continue
    }
    store.put({
      ...record,
      dirty: update.dirty,
      dirtyIndex: update.dirty ? 1 : 0,
      sourceHash: update.sourceHash,
      updatedAt: Date.now(),
    })
  }

  await transactionDone(transaction)
}

export const loadUfoGlyph = async (key: UfoGlyphPrimaryKey) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(UFO_GLYPHS_STORE).get(key)
  ) as Promise<UfoGlyphRecord | undefined>
}

export const listUfoGlyphsInLayer = async (
  projectId: string,
  ufoId: string,
  layerId: string
) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(UFO_GLYPHS_STORE)
    .index('byProjectUfoLayer')
  return requestToPromise(
    index.getAll(IDBKeyRange.only([projectId, ufoId, layerId]))
  ) as Promise<UfoGlyphRecord[]>
}

export const findUfoGlyphsByUnicode = async (unicodeHex: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readonly')
  const index = transaction.objectStore(UFO_GLYPHS_STORE).index('byUnicode')
  return requestToPromise(index.getAll(unicodeHex.toUpperCase())) as Promise<
    UfoGlyphRecord[]
  >
}

export const listDirtyUfoGlyphs = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(UFO_GLYPHS_STORE)
    .index('byProjectDirty')
  return requestToPromise(
    index.getAll(IDBKeyRange.only([projectId, 1]))
  ) as Promise<UfoGlyphRecord[]>
}

export const saveUfoUiState = async (record: UfoUiStateRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_UI_STATE_STORE, 'readwrite')
  transaction.objectStore(UFO_UI_STATE_STORE).put(record)
  await transactionDone(transaction)
}

export const loadUfoUiState = async (projectId: string, key: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(UFO_UI_STATE_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(UFO_UI_STATE_STORE).get([projectId, key])
  ) as Promise<UfoUiStateRecord | undefined>
}

export const saveUfoUiValue = async (
  projectId: string,
  key: string,
  value: unknown
) => {
  await saveUfoUiState({
    projectId,
    key,
    value,
  })
}

export const loadUfoUiValue = async <T>(projectId: string, key: string) => {
  const record = await loadUfoUiState(projectId, key)
  return (record?.value as T | undefined) ?? null
}

export const deleteUfoProjectData = async (projectId: string) => {
  const database = await openDatabase()
  const metadataRecords = await listUfoMetadataForProject(projectId)
  const glyphReadTransaction = database.transaction(
    UFO_GLYPHS_STORE,
    'readonly'
  )
  const glyphIndex = glyphReadTransaction
    .objectStore(UFO_GLYPHS_STORE)
    .index('byProject')
  const allProjectGlyphs = (await requestToPromise(
    glyphIndex.getAll(IDBKeyRange.only(projectId))
  )) as UfoGlyphRecord[]

  const transaction = database.transaction(
    [
      UFO_PROJECTS_STORE,
      UFO_METADATA_STORE,
      UFO_GLYPHS_STORE,
      UFO_UI_STATE_STORE,
    ],
    'readwrite'
  )

  transaction.objectStore(UFO_PROJECTS_STORE).delete(projectId)
  transaction
    .objectStore(UFO_UI_STATE_STORE)
    .delete(IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']))

  const metadataStore = transaction.objectStore(UFO_METADATA_STORE)
  for (const record of metadataRecords) {
    metadataStore.delete([record.projectId, record.ufoId])
  }

  const glyphStore = transaction.objectStore(UFO_GLYPHS_STORE)
  for (const record of allProjectGlyphs) {
    glyphStore.delete([
      record.projectId,
      record.ufoId,
      record.layerId,
      record.glyphName,
    ])
  }

  await transactionDone(transaction)
}
