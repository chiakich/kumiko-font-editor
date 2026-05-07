import type {
  KumikoProjectDraft,
  KumikoProjectSummary,
} from 'src/lib/projectTypes'

const DB_NAME = 'kumiko-font-editor'
const STORE_NAME = 'projects'
export const UFO_PROJECTS_STORE = 'ufo_projects'
export const UFO_METADATA_STORE = 'ufo_metadata'
export const UFO_GLYPHS_STORE = 'ufo_glyphs'
export const UFO_UI_STATE_STORE = 'ufo_ui_state'

export type ProjectDraft = KumikoProjectDraft
export type ProjectSummary = KumikoProjectSummary

export const openDatabase = async () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, 4)

    request.onupgradeneeded = () => {
      const database = request.result
      if (database.objectStoreNames.contains('drafts')) {
        database.deleteObjectStore('drafts')
      }
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(UFO_PROJECTS_STORE)) {
        database.createObjectStore(UFO_PROJECTS_STORE, { keyPath: 'projectId' })
      }
      if (!database.objectStoreNames.contains(UFO_METADATA_STORE)) {
        database.createObjectStore(UFO_METADATA_STORE, {
          keyPath: ['projectId', 'ufoId'],
        })
      }
      if (!database.objectStoreNames.contains(UFO_GLYPHS_STORE)) {
        const store = database.createObjectStore(UFO_GLYPHS_STORE, {
          keyPath: ['projectId', 'ufoId', 'layerId', 'glyphName'],
        })
        store.createIndex('byProject', 'projectId', { unique: false })
        store.createIndex(
          'byProjectUfoLayer',
          ['projectId', 'ufoId', 'layerId'],
          {
            unique: false,
          }
        )
        store.createIndex('byUnicode', 'unicodes', {
          unique: false,
          multiEntry: true,
        })
        store.createIndex('byDirty', 'dirtyIndex', { unique: false })
        store.createIndex('byProjectDirty', ['projectId', 'dirtyIndex'], {
          unique: false,
        })
      } else {
        const transaction = request.transaction
        const store = transaction?.objectStore(UFO_GLYPHS_STORE)
        if (store && !store.indexNames.contains('byDirty')) {
          store.createIndex('byDirty', 'dirtyIndex', { unique: false })
        }
        if (store && !store.indexNames.contains('byProjectDirty')) {
          store.createIndex('byProjectDirty', ['projectId', 'dirtyIndex'], {
            unique: false,
          })
        }
      }
      if (!database.objectStoreNames.contains(UFO_UI_STATE_STORE)) {
        database.createObjectStore(UFO_UI_STATE_STORE, {
          keyPath: ['projectId', 'key'],
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const loadProject = async (id: string) => {
  const database = await openDatabase()
  return new Promise<ProjectDraft | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onsuccess = () =>
      resolve((request.result as ProjectDraft | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

export const saveProject = async (draft: ProjectDraft) => {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(draft)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export const getAllProjects = async () => {
  const database = await openDatabase()
  return new Promise<ProjectSummary[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () =>
      resolve(
        (request.result as ProjectDraft[])
          .map((project) => ({
            id: project.id,
            title: project.title,
            lastModified: project.lastModified,
            createdAt: project.createdAt ?? project.lastModified,
            updatedAt: project.updatedAt ?? project.lastModified,
            sourceName: project.sourceName ?? null,
            sourceType: project.sourceType ?? 'local',
            githubSource: project.githubSource ?? null,
            projectSourceFormat: project.projectSourceFormat ?? null,
            projectRoundTripFormat: project.projectRoundTripFormat ?? null,
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt)
      )
    request.onerror = () => reject(request.error)
  })
}

export const deleteProject = async (id: string) => {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
