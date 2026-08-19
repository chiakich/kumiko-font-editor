import { describe, expect, it } from 'vitest'
import git from 'isomorphic-git'
import { createGitFs, GitFsError } from 'src/lib/git/gitFileSystem'
import { createMemoryFileStore } from './memoryFileStore'

const makeFs = () => createGitFs(createMemoryFileStore())

describe('git file system', () => {
  it('round-trips bytes and utf8 text', async () => {
    const fs = makeFs()
    await fs.promises.writeFile('/repo/a.txt', 'hello')

    expect(await fs.promises.readFile('/repo/a.txt', 'utf8')).toBe('hello')
    expect(await fs.promises.readFile('/repo/a.txt')).toBeInstanceOf(Uint8Array)
  })

  it('creates parent directories on write', async () => {
    const fs = makeFs()
    await fs.promises.writeFile('/deep/nested/path/a.txt', 'x')

    expect(await fs.promises.readdir('/deep/nested/path')).toEqual(['a.txt'])
  })

  it('raises ENOENT with a code isomorphic-git can branch on', async () => {
    const fs = makeFs()
    await expect(fs.promises.readFile('/missing.txt')).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(fs.promises.readdir('/missing')).rejects.toBeInstanceOf(
      GitFsError
    )
    await expect(fs.promises.unlink('/missing.txt')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('reports file and directory stats distinctly', async () => {
    const fs = makeFs()
    await fs.promises.writeFile('/repo/a.txt', 'hello')

    const file = await fs.promises.stat('/repo/a.txt')
    const dir = await fs.promises.stat('/repo')

    expect(file.isFile()).toBe(true)
    expect(file.isDirectory()).toBe(false)
    expect(file.size).toBe(5)
    expect(dir.isDirectory()).toBe(true)
    expect(dir.isFile()).toBe(false)
  })

  it('lists directories and files without their parent prefix', async () => {
    const fs = makeFs()
    await fs.promises.writeFile('/repo/a.txt', 'a')
    await fs.promises.writeFile('/repo/sub/b.txt', 'b')

    expect(await fs.promises.readdir('/repo')).toEqual(['a.txt', 'sub'])
  })

  it('removes files and directories', async () => {
    const fs = makeFs()
    await fs.promises.writeFile('/repo/a.txt', 'a')
    await fs.promises.unlink('/repo/a.txt')
    await fs.promises.mkdir('/empty')
    await fs.promises.rmdir('/empty')

    expect(await fs.promises.readdir('/repo')).toEqual([])
    await expect(fs.promises.readdir('/empty')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})

describe('git file system under isomorphic-git', () => {
  it('supports a real init, add and commit cycle', async () => {
    const fs = makeFs()
    const dir = '/repo'

    await git.init({ fs, dir, defaultBranch: 'main' })
    await fs.promises.writeFile('/repo/a.txt', 'hello')
    await git.add({ fs, dir, filepath: 'a.txt' })
    const oid = await git.commit({
      fs,
      dir,
      message: 'first',
      author: { name: 'Kumiko', email: 'kumiko@example.test' },
    })

    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    const log = await git.log({ fs, dir })
    expect(log).toHaveLength(1)
    expect(log[0]?.commit.message.trim()).toBe('first')
  })

  it('reads committed blobs back through git', async () => {
    const fs = makeFs()
    const dir = '/repo'
    await git.init({ fs, dir, defaultBranch: 'main' })
    await fs.promises.writeFile('/repo/glyphs/A_.glif', '<glyph/>')
    await git.add({ fs, dir, filepath: 'glyphs/A_.glif' })
    const oid = await git.commit({
      fs,
      dir,
      message: 'add glyph',
      author: { name: 'Kumiko', email: 'kumiko@example.test' },
    })

    const blob = await git.readBlob({
      fs,
      dir,
      oid,
      filepath: 'glyphs/A_.glif',
    })
    expect(new TextDecoder().decode(blob.blob)).toBe('<glyph/>')
  })

  it('finds the merge base of two branches', async () => {
    const fs = makeFs()
    const dir = '/repo'
    const author = { name: 'Kumiko', email: 'kumiko@example.test' }
    await git.init({ fs, dir, defaultBranch: 'main' })
    await fs.promises.writeFile('/repo/a.txt', 'base')
    await git.add({ fs, dir, filepath: 'a.txt' })
    const base = await git.commit({ fs, dir, message: 'base', author })

    await git.branch({ fs, dir, ref: 'feature', checkout: true })
    await fs.promises.writeFile('/repo/a.txt', 'feature')
    await git.add({ fs, dir, filepath: 'a.txt' })
    const feature = await git.commit({ fs, dir, message: 'feature', author })

    const merged = await git.findMergeBase({ fs, dir, oids: [base, feature] })
    expect(merged).toEqual([base])
  })
})
