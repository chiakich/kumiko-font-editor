import {
  baseNameOf,
  dirNameOf,
  normalizeStorePath,
  type FileStore,
  type FileStoreEntry,
} from '@/lib/git/fileStore'

const segmentsOf = (path: string) =>
  normalizeStorePath(path).split('/').filter(Boolean)

// A missing entry is an expected answer; anything else — a locked file, a quota
// failure, a path that is the wrong kind — must not be flattened into "absent",
// or the git layer reports every real failure as ENOENT and the actual cause is
// lost. TypeMismatchError says the path exists as the other kind.
const ABSENT_ERRORS = new Set(['NotFoundError', 'TypeMismatchError'])

const isAbsent = (error: unknown) =>
  error instanceof DOMException && ABSENT_ERRORS.has(error.name)

const resolveDir = async (
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean
) => {
  let handle = root
  for (const segment of segmentsOf(path)) {
    try {
      handle = await handle.getDirectoryHandle(segment, { create })
    } catch (error) {
      if (isAbsent(error)) {
        return null
      }
      throw error
    }
  }
  return handle
}

const resolveFile = async (
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean
) => {
  const parent = await resolveDir(root, dirNameOf(path), create)
  const name = baseNameOf(path)
  if (!parent || !name) {
    return null
  }
  try {
    return await parent.getFileHandle(name, { create })
  } catch (error) {
    if (isAbsent(error)) {
      return null
    }
    throw error
  }
}

// createSyncAccessHandle is worker-only; the sync stack also runs on the main
// thread, where createWritable is the available path. Prefer the sync handle
// when it works — it is markedly faster for the many small files a UFO holds.
const writeFileHandle = async (
  handle: FileSystemFileHandle,
  data: Uint8Array
) => {
  if (typeof handle.createSyncAccessHandle === 'function') {
    try {
      const accessHandle = await handle.createSyncAccessHandle()
      try {
        accessHandle.truncate(0)
        accessHandle.write(data, { at: 0 })
        accessHandle.flush()
        return
      } finally {
        accessHandle.close()
      }
    } catch (error) {
      // Off-worker some engines expose the method but reject it; that is the
      // only case worth falling back for. A lock or quota failure must surface.
      if (
        error instanceof DOMException &&
        error.name !== 'InvalidStateError' &&
        error.name !== 'NotSupportedError'
      ) {
        throw error
      }
    }
  }

  const writable = await handle.createWritable()
  // Copy into a plain ArrayBuffer: a Uint8Array view over a SharedArrayBuffer
  // is not an accepted chunk type.
  await writable.write(
    data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as ArrayBuffer
  )
  await writable.close()
}

// OPFS-backed store. The only place in the git stack that knows about
// FileSystemDirectoryHandle.
export const createOpfsFileStore = (
  root: FileSystemDirectoryHandle
): FileStore => ({
  readFile: async (path) => {
    const handle = await resolveFile(root, path, false)
    if (!handle) {
      return null
    }
    const file = await handle.getFile()
    return new Uint8Array(await file.arrayBuffer())
  },

  writeFile: async (path, data) => {
    const handle = await resolveFile(root, path, true)
    if (!handle) {
      throw new Error(`無法寫入 OPFS 路徑：${path}`)
    }
    await writeFileHandle(handle, data)
  },

  deleteFile: async (path) => {
    const parent = await resolveDir(root, dirNameOf(path), false)
    const name = baseNameOf(path)
    if (!parent || !name) {
      return false
    }
    try {
      await parent.removeEntry(name)
      return true
    } catch {
      return false
    }
  },

  listDir: async (path) => {
    const handle = await resolveDir(root, path, false)
    if (!handle) {
      return null
    }
    const entries: FileStoreEntry[] = []
    for await (const [name, child] of handle.entries()) {
      entries.push({
        name,
        kind: child.kind === 'directory' ? 'directory' : 'file',
      })
    }
    return entries
  },

  makeDir: async (path) => {
    await resolveDir(root, path, true)
  },

  removeDir: async (path, options) => {
    const parent = await resolveDir(root, dirNameOf(path), false)
    const name = baseNameOf(path)
    if (!parent || !name) {
      return false
    }
    try {
      await parent.removeEntry(name, { recursive: options?.recursive ?? false })
      return true
    } catch {
      return false
    }
  },

  statPath: async (path) => {
    const normalized = normalizeStorePath(path)
    if (!normalized) {
      return { kind: 'directory', size: 0, mtimeMs: 0 }
    }
    const fileHandle = await resolveFile(root, normalized, false)
    if (fileHandle) {
      const file = await fileHandle.getFile()
      return { kind: 'file', size: file.size, mtimeMs: file.lastModified }
    }
    const dirHandle = await resolveDir(root, normalized, false)
    return dirHandle ? { kind: 'directory', size: 0, mtimeMs: 0 } : null
  },
})
