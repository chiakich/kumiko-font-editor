import {
  dirNameOf,
  normalizeStorePath,
  type FileStore,
  type FileStoreEntry,
} from 'src/lib/git/fileStore'

// In-memory FileStore so the git stack can be exercised without OPFS. Paths are
// flat keys; directories are tracked separately so empty dirs behave.
export const createMemoryFileStore = (): FileStore => {
  const files = new Map<string, { data: Uint8Array; mtimeMs: number }>()
  const dirs = new Set<string>([''])
  let clock = 1

  const ensureDirChain = (path: string) => {
    const segments = normalizeStorePath(path).split('/').filter(Boolean)
    let current = ''
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      dirs.add(current)
    }
  }

  return {
    readFile: async (path) => files.get(normalizeStorePath(path))?.data ?? null,

    writeFile: async (path, data) => {
      const normalized = normalizeStorePath(path)
      ensureDirChain(dirNameOf(normalized))
      clock += 1
      files.set(normalized, { data: new Uint8Array(data), mtimeMs: clock })
    },

    deleteFile: async (path) => files.delete(normalizeStorePath(path)),

    listDir: async (path) => {
      const normalized = normalizeStorePath(path)
      if (!dirs.has(normalized)) {
        return null
      }
      const prefix = normalized ? `${normalized}/` : ''
      const entries = new Map<string, FileStoreEntry>()
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) {
          continue
        }
        const rest = filePath.slice(prefix.length)
        if (!rest.includes('/')) {
          entries.set(rest, { name: rest, kind: 'file' })
        }
      }
      for (const dirPath of dirs) {
        if (!dirPath || dirPath === normalized || !dirPath.startsWith(prefix)) {
          continue
        }
        const rest = dirPath.slice(prefix.length)
        if (!rest.includes('/')) {
          entries.set(rest, { name: rest, kind: 'directory' })
        }
      }
      return [...entries.values()]
    },

    makeDir: async (path) => ensureDirChain(path),

    removeDir: async (path, options) => {
      const normalized = normalizeStorePath(path)
      if (!dirs.has(normalized)) {
        return false
      }
      const prefix = `${normalized}/`
      if (options?.recursive) {
        for (const filePath of [...files.keys()]) {
          if (filePath.startsWith(prefix)) {
            files.delete(filePath)
          }
        }
        for (const dirPath of [...dirs]) {
          if (dirPath.startsWith(prefix)) {
            dirs.delete(dirPath)
          }
        }
      }
      dirs.delete(normalized)
      return true
    },

    statPath: async (path) => {
      const normalized = normalizeStorePath(path)
      const file = files.get(normalized)
      if (file) {
        return {
          kind: 'file',
          size: file.data.byteLength,
          mtimeMs: file.mtimeMs,
        }
      }
      return dirs.has(normalized)
        ? { kind: 'directory', size: 0, mtimeMs: 0 }
        : null
    },
  }
}
