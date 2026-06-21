import {
  KUMIKO_GLYPHS_STORE,
  KUMIKO_PROJECTS_STORE,
  KUMIKO_UI_STATE_STORE,
  openDatabase,
} from 'src/lib/project/persistence'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'
import {
  createKumikoGlyphDigest,
  createKumikoProjectDigest,
  findGeometryBearingSourceDataKey,
} from 'src/lib/project/kumikoFontDataAdapter'
import type {
  KumikoGlyphPrimaryKey,
  KumikoGlyphMetadataRecord,
  KumikoGlyphRecord,
  KumikoGlyphSyncMetadata,
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

export interface KumikoGlyphMetadataPatchInput {
  projectId: string
  glyphId: string
  patch: KumikoGlyphMetadataPatch
  updatedAt?: number
  exportDirty?: boolean | 0 | 1
  syncDirty?: boolean | 0 | 1
}

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
  glyphMetadataPatches?: KumikoGlyphMetadataPatchInput[]
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
  for (const patchInput of input.glyphMetadataPatches ?? []) {
    const patched = await patchGlyphMetadataInStore(glyphStore, patchInput)
    if (patched) {
      glyphStore.put(patched)
    }
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

const patchGlyphMetadataInStore = async (
  store: IDBObjectStore,
  input: KumikoGlyphMetadataPatchInput
) => {
  const key = makeKumikoGlyphKey(input.projectId, input.glyphId)
  const record = (await requestToPromise(store.get(key))) as
    | KumikoGlyphRecord
    | undefined

  if (!record) {
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
    exportedDigest: nextRecord.exportDirty ? record.exportedDigest : digest,
    syncedDigest: nextRecord.syncDirty ? record.syncedDigest : digest,
  }

  return persistedRecord
}

export const patchKumikoGlyphMetadata = async (
  input: KumikoGlyphMetadataPatchInput
) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readwrite')
  const store = transaction.objectStore(KUMIKO_GLYPHS_STORE)
  const persistedRecord = await patchGlyphMetadataInStore(store, input)
  if (persistedRecord) {
    store.put(persistedRecord)
  }
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

export const listKumikoGlyphSyncMetadataForProject = async (
  projectId: string
) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction.objectStore(KUMIKO_GLYPHS_STORE).index('byProject')
  const records: KumikoGlyphSyncMetadata[] = []
  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(projectId)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      const record = cursor.value as KumikoGlyphRecord
      records.push({
        projectId: record.projectId,
        glyphId: record.glyphId,
        sourceData: record.sourceData,
        syncDirty: record.syncDirty,
      })
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
  await transactionDone(transaction)
  return records
}

export const listKumikoGlyphMetadataForProject = async (projectId: string) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction.objectStore(KUMIKO_GLYPHS_STORE).index('byProject')
  const records: KumikoGlyphMetadataRecord[] = []
  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(projectId)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      const record = cursor.value as KumikoGlyphRecord
      records.push({
        projectId: record.projectId,
        glyphId: record.glyphId,
        displayName: record.displayName,
        unicodes: record.unicodes,
        production: record.production,
        export: record.export,
        category: record.category,
        subCategory: record.subCategory,
        status: record.status,
        color: record.color,
        note: record.note,
        leftMetricsKey: record.leftMetricsKey,
        rightMetricsKey: record.rightMetricsKey,
        widthMetricsKey: record.widthMetricsKey,
        layerOrder: record.layerOrder,
        componentGlyphIds: record.componentGlyphIds,
        hasDrawableContent: record.hasDrawableContent,
        customData: record.customData,
        sourceData: record.sourceData,
      })
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
  await transactionDone(transaction)
  return records
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

const listDirtyKumikoGlyphIds = async (
  projectId: string,
  indexName: 'byProjectExportDirty' | 'byProjectSyncDirty'
) => {
  const database = await openDatabase()
  const transaction = database.transaction(KUMIKO_GLYPHS_STORE, 'readonly')
  const index = transaction.objectStore(KUMIKO_GLYPHS_STORE).index(indexName)
  const glyphIds: string[] = []
  await new Promise<void>((resolve, reject) => {
    const request = index.openKeyCursor(IDBKeyRange.only([projectId, 1]))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve()
        return
      }
      const primaryKey = cursor.primaryKey
      if (Array.isArray(primaryKey) && typeof primaryKey[1] === 'string') {
        glyphIds.push(primaryKey[1])
      }
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
  await transactionDone(transaction)
  return glyphIds
}

export const listExportDirtyKumikoGlyphIds = async (projectId: string) =>
  listDirtyKumikoGlyphIds(projectId, 'byProjectExportDirty')

export const listSyncDirtyKumikoGlyphIds = async (projectId: string) =>
  listDirtyKumikoGlyphIds(projectId, 'byProjectSyncDirty')

export const getKumikoProjectDirtyState = async (projectId: string) => {
  const [project, exportDirtyGlyphIds, syncDirtyGlyphIds] = await Promise.all([
    loadKumikoProjectRecord(projectId),
    listExportDirtyKumikoGlyphIds(projectId),
    listSyncDirtyKumikoGlyphIds(projectId),
  ])

  return {
    projectExportDirty: project?.exportDirty === 1,
    projectSyncDirty: project?.syncDirty === 1,
    exportDirtyGlyphIds,
    syncDirtyGlyphIds,
    exportDirty: project?.exportDirty === 1 || exportDirtyGlyphIds.length > 0,
    syncDirty: project?.syncDirty === 1 || syncDirtyGlyphIds.length > 0,
  }
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
    const nextRecord: KumikoGlyphRecord = {
      ...record,
      exportDirty: exportDirtyValue,
      updatedAt: timestamp,
    }
    store.put({
      ...nextRecord,
      exportedDigest: exportDirtyValue
        ? record.exportedDigest
        : createKumikoGlyphDigest(nextRecord),
    })
  }

  await transactionDone(transaction)
}

export const markKumikoProjectExportClean = async (
  projectId: string,
  options: { batchSize?: number } = {}
) => {
  const batchSize = options.batchSize ?? 256
  const [project, glyphMetadata] = await Promise.all([
    loadKumikoProjectRecord(projectId),
    listKumikoGlyphMetadataForProject(projectId),
  ])
  if (!project) {
    return
  }

  const timestamp = Date.now()
  for (let index = 0; index < glyphMetadata.length; index += batchSize) {
    const batch = glyphMetadata.slice(index, index + batchSize)
    await updateKumikoGlyphExportDirtyState(
      batch.map((glyph) => makeKumikoGlyphKey(projectId, glyph.glyphId)),
      false
    )
  }

  const nextProject: KumikoProjectRecord = {
    ...project,
    exportDirty: 0,
    updatedAt: timestamp,
  }
  await saveKumikoProjectRecord({
    ...nextProject,
    exportedDigest: createKumikoProjectDigest(nextProject),
  })
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
    const nextRecord: KumikoGlyphRecord = {
      ...record,
      syncDirty: syncDirtyValue,
      updatedAt: timestamp,
    }
    store.put({
      ...nextRecord,
      syncedDigest: syncDirtyValue
        ? record.syncedDigest
        : createKumikoGlyphDigest(nextRecord),
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
