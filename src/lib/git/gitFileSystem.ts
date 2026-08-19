import {
  dirNameOf,
  normalizeStorePath,
  type FileStore,
} from 'src/lib/git/fileStore'

// isomorphic-git inspects `err.code`, so failures have to look like Node's.
export class GitFsError extends Error {
  code: string

  constructor(code: string, path: string) {
    super(`${code}: ${path}`)
    this.name = code
    this.code = code
  }
}

const FILE_MODE = 0o100644
const DIR_MODE = 0o40000

interface GitStats {
  type: 'file' | 'dir'
  mode: number
  size: number
  ino: number
  mtimeMs: number
  ctimeMs: number
  uid: number
  gid: number
  dev: number
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

const makeStats = (input: {
  kind: 'file' | 'directory'
  size: number
  mtimeMs: number
}): GitStats => {
  const isDirectory = input.kind === 'directory'
  return {
    type: isDirectory ? 'dir' : 'file',
    mode: isDirectory ? DIR_MODE : FILE_MODE,
    size: input.size,
    // The store has no inode numbers; git only uses it to detect changes, and
    // mtime plus size already cover that here.
    ino: 0,
    mtimeMs: input.mtimeMs,
    ctimeMs: input.mtimeMs,
    uid: 0,
    gid: 0,
    dev: 0,
    isFile: () => !isDirectory,
    isDirectory: () => isDirectory,
    isSymbolicLink: () => false,
  }
}

const decoder = new TextDecoder()
const encoder = new TextEncoder()

type Encoding = string | { encoding?: string } | undefined

const wantsText = (options: Encoding) =>
  typeof options === 'string'
    ? options === 'utf8' || options === 'utf-8'
    : options?.encoding === 'utf8' || options?.encoding === 'utf-8'

// Builds the PromiseFsClient isomorphic-git expects on top of a FileStore.
export const createGitFs = (store: FileStore) => {
  const readFile = async (path: string, options?: Encoding) => {
    const data = await store.readFile(normalizeStorePath(path))
    if (data === null) {
      throw new GitFsError('ENOENT', path)
    }
    return wantsText(options) ? decoder.decode(data) : data
  }

  const writeFile = async (
    path: string,
    data: Uint8Array | string,
    options?: Encoding
  ) => {
    void options
    const normalized = normalizeStorePath(path)
    const parent = dirNameOf(normalized)
    if (parent) {
      await store.makeDir(parent)
    }
    await store.writeFile(
      normalized,
      typeof data === 'string' ? encoder.encode(data) : data
    )
  }

  const unlink = async (path: string) => {
    if (!(await store.deleteFile(normalizeStorePath(path)))) {
      throw new GitFsError('ENOENT', path)
    }
  }

  const readdir = async (path: string) => {
    const entries = await store.listDir(normalizeStorePath(path))
    if (entries === null) {
      throw new GitFsError('ENOENT', path)
    }
    return entries.map((entry) => entry.name).sort()
  }

  const mkdir = async (path: string) => {
    await store.makeDir(normalizeStorePath(path))
  }

  const rmdir = async (path: string) => {
    if (!(await store.removeDir(normalizeStorePath(path)))) {
      throw new GitFsError('ENOENT', path)
    }
  }

  const stat = async (path: string) => {
    const found = await store.statPath(normalizeStorePath(path))
    if (!found) {
      throw new GitFsError('ENOENT', path)
    }
    return makeStats(found)
  }

  return {
    promises: {
      readFile,
      writeFile,
      unlink,
      readdir,
      mkdir,
      rmdir,
      stat,
      // The store has no symlinks, so lstat and stat cannot differ.
      lstat: stat,
      readlink: async (path: string) => {
        throw new GitFsError('EINVAL', path)
      },
      symlink: async (_target: string, path: string) => {
        throw new GitFsError('EPERM', path)
      },
      chmod: async () => {},
    },
  }
}

export type GitFs = ReturnType<typeof createGitFs>
