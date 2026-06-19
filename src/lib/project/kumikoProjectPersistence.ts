import {
  KUMIKO_GLYPHS_STORE,
  KUMIKO_PROJECTS_STORE,
  KUMIKO_UI_STATE_STORE,
  openDatabase,
} from 'src/lib/project/persistence'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'
import {
  createKumikoGlyphDigest,
  findGeometryBearingSourceDataKey,
} from 'src/lib/project/kumikoFontDataAdapter'
import type {
  KumikoGlyphPrimaryKey,
  KumikoGlyphRecord,
  KumikoProjectRecord,
  KumikoUiStateRecord,
} from 'src/lib/project/kumikoProjectTypes'

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

export const makeKumikoGlyphKey = (
  projectId: string,
  glyphId: string
): KumikoGlyphPrimaryKey => [projectId, glyphId]

const storageIndexKey = (projectId: string, value: string) =>
  `${projectId}\0${value}`

export type KumikoGlyphMetadataPatch = Partial<
  Pick<
    KumikoGlyphRecord,
    | 'displayName'
    | 'unicodes'
    | 'production'
    | 'export'
    | 'category'
    | 'subCategory'
    | 'status'
    | 'color'
    | 'note'
    | 'leftMetricsKey'
    | 'rightMetricsKey'
    | 'widthMetricsKey'
    | 'customData'
    | 'sourceData'
  >
>

const normalizeGlyphRecordUnicodes = (
  unicodes: KumikoGlyphRecord['unicodes']
) => {
  const normalized = unicodes
    .map((unicode) => normalizeUnicodeHex(unicode))
    .filter((unicode): unicode is string => Boolean(unicode))
  return [...new Set(normalized)]
}

export const saveKumikoProjectRecord = async (record: KumikoProjectRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_PROJECTS_STORE, 'readwrite')
  transaction.objectStore(KUMIKO_PROJECTS_STORE).put(record)
  await transactionDone(transaction)
}

export const loadKumikoProjectRecord = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_PROJECTS_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(KUMIKO_PROJECTS_STORE).get(projectId)
  ) as Promise<KumikoProjectRecord | undefined>
}

export const listKumikoProjectRecords = async () => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_PROJECTS_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(KUMIKO_PROJECTS_STORE).getAll()
  ) as Promise<KumikoProjectRecord[]>
}

export const replaceKumikoProjectData = async (
  project: KumikoProjectRecord,
  glyphs: KumikoGlyphRecord[]
) => {
  const database = await openDatabase()
  const transaction = database.transaction(
    [KUMIKO_PROJECTS_STORE, KUMIKO_GLYPHS_STORE],
    'readwrite'
  )
  const projectStore = transaction.objectStore(KUMIKO_PROJECTS_STORE)
  const glyphStore = transaction.objectStore(KUMIKO_GLYPHS_STORE)

  projectStore.put(project)
  glyphStore.delete(
    IDBKeyRange.bound([project.projectId, ''], [project.projectId, '\uffff'])
  )
  for (const glyph of glyphs) {
    glyphStore.put(glyph)
  }

  await transactionDone(transaction)
}

export const patchKumikoProjectData = async (input: {
  project: KumikoProjectRecord
  glyphsToSave?: KumikoGlyphRecord[]
  glyphKeysToDelete?: KumikoGlyphPrimaryKey[]
  uiStateToSave?: KumikoUiStateRecord[]
}) => {
  const database = await openDatabase()
  const transaction = database.transaction(
    [KUMIKO_PROJECTS_STORE, KUMIKO_GLYPHS_STORE, KUMIKO_UI_STATE_STORE],
    'readwrite'
  )
  const projectStore = transaction.objectStore(KUMIKO_PROJECTS_STORE)
  const glyphStore = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  const uiStore = transaction.objectStore(KUMIKO_UI_STATE_STORE)

  projectStore.put(input.project)
  for (const glyph of input.glyphsToSave ?? []) {
    glyphStore.put(glyph)
  }
  for (const key of input.glyphKeysToDelete ?? []) {
    glyphStore.delete(key)
  }
  for (const record of input.uiStateToSave ?? []) {
    uiStore.put(record)
  }

  await transactionDone(transaction)
}

export const renameKumikoProjectRecord = async (
  projectId: string,
  title: string
) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_PROJECTS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_PROJECTS_STORE)
  const record = (await requestToPromise(store.get(projectId))) as
    | KumikoProjectRecord
    | undefined
  if (record) {
    store.put({ ...record, title, updatedAt: Date.now() })
  }
  await transactionDone(transaction)
}

export const deleteKumikoProjectRecord = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(
    [KUMIKO_PROJECTS_STORE, KUMIKO_GLYPHS_STORE, KUMIKO_UI_STATE_STORE],
    'readwrite'
  )
  transaction.objectStore(KUMIKO_PROJECTS_STORE).delete(projectId)
  transaction
    .objectStore(KUMIKO_GLYPHS_STORE)
    .delete(IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']))
  transaction
    .objectStore(KUMIKO_UI_STATE_STORE)
    .delete(IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']))
  await transactionDone(transaction)
}

export const saveKumikoGlyphRecord = async (record: KumikoGlyphRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  transaction.objectStore(KUMIKO_GLYPHS_STORE).put(record)
  await transactionDone(transaction)
}

export const saveKumikoGlyphRecordBatch = async (
  records: KumikoGlyphRecord[]
) => {
  if (records.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  for (const record of records) {
    store.put(record)
  }
  await transactionDone(transaction)
}

export const loadKumikoGlyphRecord = async (key: KumikoGlyphPrimaryKey) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(KUMIKO_GLYPHS_STORE).get(key)
  ) as Promise<KumikoGlyphRecord | undefined>
}

export const loadKumikoGlyphRecords = async (keys: KumikoGlyphPrimaryKey[]) => {
  if (keys.length === 0) {
    return []
  }

  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  const done = transactionDone(transaction)
  const records = await Promise.all(
    keys.map(
      (key) =>
        requestToPromise(store.get(key)) as Promise<
          KumikoGlyphRecord | undefined
        >
    )
  )
  await done
  return records.filter((record): record is KumikoGlyphRecord =>
    Boolean(record)
  )
}

export const patchKumikoGlyphMetadata = async (input: {
  projectId: string
  glyphId: string
  patch: KumikoGlyphMetadataPatch
  updatedAt?: number
  exportDirty?: boolean | 0 | 1
  syncDirty?: boolean | 0 | 1
}) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  const key = makeKumikoGlyphKey(input.projectId, input.glyphId)
  const record = (await requestToPromise(store.get(key))) as
    | KumikoGlyphRecord
    | undefined

  if (!record) {
    await transactionDone(transaction)
    return null
  }

  const geometrySourceDataKey = findGeometryBearingSourceDataKey(
    input.patch.sourceData,
    `glyph(${record.glyphId}).sourceData`
  )
  if (geometrySourceDataKey) {
    throw new Error(
      `Kumiko sourceData cannot contain geometry key: ${geometrySourceDataKey}`
    )
  }

  const unicodes = input.patch.unicodes
    ? normalizeGlyphRecordUnicodes(input.patch.unicodes)
    : record.unicodes
  const exportDirty =
    input.exportDirty === undefined
      ? record.exportDirty
      : input.exportDirty
        ? 1
        : 0
  const syncDirty =
    input.syncDirty === undefined ? record.syncDirty : input.syncDirty ? 1 : 0
  const nextRecord: KumikoGlyphRecord = {
    ...record,
    ...input.patch,
    glyphId: record.glyphId,
    projectId: record.projectId,
    layerOrder: record.layerOrder,
    layers: record.layers,
    componentGlyphIds: record.componentGlyphIds,
    componentRefKeys: record.componentRefKeys,
    unicodes,
    unicodeKeys: unicodes.map((unicode) =>
      storageIndexKey(record.projectId, unicode)
    ),
    exportDirty,
    syncDirty,
    updatedAt: input.updatedAt ?? Date.now(),
  }
  const digest = createKumikoGlyphDigest(nextRecord)
  const persistedRecord: KumikoGlyphRecord = {
    ...nextRecord,
    exportedDigest: nextRecord.exportDirty ? null : digest,
    syncedDigest: nextRecord.syncDirty ? null : digest,
  }

  store.put(persistedRecord)
  await transactionDone(transaction)
  return persistedRecord
}

export const listKumikoGlyphRecordsForProject = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction.objectStore(KUMIKO_GLYPHS_STORE).index('byProject')
  return requestToPromise(index.getAll(projectId)) as Promise<
    KumikoGlyphRecord[]
  >
}

export const listLiveKumikoGlyphRecordsForProject = async (
  projectId: string
) => {
  return listKumikoGlyphRecordsForProject(projectId)
}

export const findKumikoGlyphRecordsByUnicode = async (
  projectId: string,
  unicodeHex: string
) => {
  const normalizedUnicode = normalizeUnicodeHex(unicodeHex)
  if (!normalizedUnicode) {
    return []
  }

  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(KUMIKO_GLYPHS_STORE)
    .index('byUnicodeKey')
  return requestToPromise(
    index.getAll(`${projectId}\0${normalizedUnicode}`)
  ) as Promise<KumikoGlyphRecord[]>
}

export const findKumikoGlyphRecordsByComponentRef = async (
  projectId: string,
  componentGlyphId: string
) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(KUMIKO_GLYPHS_STORE)
    .index('byComponentRefKey')
  return requestToPromise(
    index.getAll(`${projectId}\0${componentGlyphId}`)
  ) as Promise<KumikoGlyphRecord[]>
}

export const findKumikoGlyphRecordsByDisplayName = async (
  projectId: string,
  displayName: string
) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(KUMIKO_GLYPHS_STORE)
    .index('byDisplayName')
  return requestToPromise(index.getAll([projectId, displayName])) as Promise<
    KumikoGlyphRecord[]
  >
}

export const listExportDirtyKumikoGlyphRecords = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(KUMIKO_GLYPHS_STORE)
    .index('byProjectExportDirty')
  return requestToPromise(index.getAll([projectId, 1])) as Promise<
    KumikoGlyphRecord[]
  >
}

export const listSyncDirtyKumikoGlyphRecords = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction
    .objectStore(KUMIKO_GLYPHS_STORE)
    .index('byProjectSyncDirty')
  return requestToPromise(index.getAll([projectId, 1])) as Promise<
    KumikoGlyphRecord[]
  >
}

export const updateKumikoGlyphExportDirtyState = async (
  keys: KumikoGlyphPrimaryKey[],
  exportDirty: boolean | 0 | 1
) => {
  if (keys.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  const timestamp = Date.now()
  const exportDirtyValue = exportDirty ? 1 : 0

  for (const key of keys) {
    const record = (await requestToPromise(store.get(key))) as
      | KumikoGlyphRecord
      | undefined
    if (!record) {
      continue
    }
    store.put({
      ...record,
      exportDirty: exportDirtyValue,
      updatedAt: timestamp,
    })
  }

  await transactionDone(transaction)
}

export const updateKumikoGlyphSyncDirtyState = async (
  keys: KumikoGlyphPrimaryKey[],
  syncDirty: boolean | 0 | 1
) => {
  if (keys.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  const timestamp = Date.now()
  const syncDirtyValue = syncDirty ? 1 : 0

  for (const key of keys) {
    const record = (await requestToPromise(store.get(key))) as
      | KumikoGlyphRecord
      | undefined
    if (!record) {
      continue
    }
    store.put({
      ...record,
      syncDirty: syncDirtyValue,
      updatedAt: timestamp,
    })
  }

  await transactionDone(transaction)
}

export const deleteKumikoGlyphRecordBatch = async (
  keys: KumikoGlyphPrimaryKey[]
) => {
  if (keys.length === 0) {
    return
  }

  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  for (const key of keys) {
    store.delete(key)
  }
  await transactionDone(transaction)
}

export const saveKumikoUiState = async (record: KumikoUiStateRecord) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_UI_STATE_STORE, 'readwrite')
  transaction.objectStore(KUMIKO_UI_STATE_STORE).put(record)
  await transactionDone(transaction)
}

export const saveKumikoUiValue = async (
  projectId: string,
  key: string,
  value: unknown
) => {
  await saveKumikoUiState({ projectId, key, value })
}

export const loadKumikoUiState = async (projectId: string, key: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_UI_STATE_STORE, 'readonly')
  return requestToPromise(
    transaction.objectStore(KUMIKO_UI_STATE_STORE).get([projectId, key])
  ) as Promise<KumikoUiStateRecord | undefined>
}

export const loadKumikoUiValue = async <T>(projectId: string, key: string) => {
  const record = await loadKumikoUiState(projectId, key)
  return (record?.value as T | undefined) ?? null
}
