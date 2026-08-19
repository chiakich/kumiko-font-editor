// A minimal storage port. isomorphic-git talks POSIX; this interface talks
// bytes and directories, so the OPFS specifics stay in one place and tests can
// swap in an in-memory store.
export interface FileStoreEntry {
  name: string
  kind: 'file' | 'directory'
}

export interface FileStore {
  // Null when the path does not exist or is not a file.
  readFile(path: string): Promise<Uint8Array | null>
  writeFile(path: string, data: Uint8Array): Promise<void>
  deleteFile(path: string): Promise<boolean>
  // Null when the path does not exist or is not a directory.
  listDir(path: string): Promise<FileStoreEntry[] | null>
  makeDir(path: string): Promise<void>
  removeDir(path: string, options?: { recursive?: boolean }): Promise<boolean>
  // Null when the path does not exist.
  statPath(path: string): Promise<{
    kind: 'file' | 'directory'
    size: number
    mtimeMs: number
  } | null>
}

export const normalizeStorePath = (path: string) =>
  path.split('/').filter(Boolean).join('/')

export const dirNameOf = (path: string) => {
  const segments = normalizeStorePath(path).split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

export const baseNameOf = (path: string) => {
  const segments = normalizeStorePath(path).split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}
