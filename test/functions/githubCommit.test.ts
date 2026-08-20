import { afterEach, describe, expect, it, vi } from 'vitest'

import { onRequestPost } from '../../functions/api/github/commit'

interface RecordedCall {
  method: string
  url: string
  body: Record<string, unknown> | null
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let canPushToSource = false
// The repo owner's own account holds a repository of the same name that is not
// a fork of anything.
let viewerRepoIsFork = true

const stubGitHubApi = (calls: RecordedCall[]) => {
  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({
      method,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })

    if (url === 'https://api.github.com/repos/upstream/font') {
      return jsonResponse({
        name: 'font',
        full_name: 'upstream/font',
        owner: { login: 'upstream' },
        default_branch: 'main',
        permissions: { push: canPushToSource },
      })
    }
    if (url === 'https://api.github.com/user') {
      return jsonResponse({ login: 'viewer' })
    }
    if (url === 'https://api.github.com/repos/viewer/font') {
      return jsonResponse({
        name: 'font',
        full_name: 'viewer/font',
        owner: { login: 'viewer' },
        default_branch: 'main',
        ...(viewerRepoIsFork ? { parent: { full_name: 'upstream/font' } } : {}),
        permissions: { push: true },
      })
    }
    // no existing patch branch
    if (url.endsWith('/git/ref/heads/kumiko%2Fpatch')) {
      return jsonResponse({ message: 'Not Found' }, 404)
    }
    if (url.endsWith('/git/ref/heads/main')) {
      return jsonResponse({ object: { sha: 'base-commit' } })
    }
    if (url.endsWith('/git/commits/base-commit')) {
      return jsonResponse({ tree: { sha: 'base-tree' } })
    }
    if (method === 'POST' && url.endsWith('/git/refs')) {
      return jsonResponse({ ok: true })
    }
    if (method === 'POST' && url.endsWith('/git/trees')) {
      const index = calls.filter(
        (call) => call.method === 'POST' && call.url.endsWith('/git/trees')
      ).length
      return jsonResponse({ sha: `tree-${index}` })
    }
    if (method === 'POST' && url.endsWith('/git/commits')) {
      return jsonResponse({ sha: 'new-commit' })
    }
    if (method === 'PATCH' && url.includes('/git/refs/heads/')) {
      return jsonResponse({ ok: true })
    }
    if (url.includes('/compare/')) {
      return jsonResponse({ status: 'ahead', ahead_by: 1, behind_by: 0 })
    }

    throw new Error(`unstubbed ${method} ${url}`)
  }

  vi.stubGlobal('fetch', vi.fn(handler))
}

const postCommit = (files: Array<{ path: string; content?: string }>) =>
  onRequestPost({
    request: new Request('https://kumiko.test/api/github/commit', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: 'upstream/font',
        baseBranch: 'main',
        branchName: 'kumiko/patch',
        commitMessage: 'Update glyphs',
        files,
      }),
    }),
    env: {},
    // the handler only uses request and env
  } as unknown as Parameters<typeof onRequestPost>[0]) as Promise<Response>

const glyphFiles = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    path: `sources/Font.ufo/glyphs/glyph${index}.glif`,
    content: `<glyph name="glyph${index}"/>`,
  }))

afterEach(() => {
  vi.unstubAllGlobals()
  canPushToSource = false
  viewerRepoIsFork = true
})

describe('github commit endpoint', () => {
  it('inlines file contents instead of creating a blob per file', async () => {
    const calls: RecordedCall[] = []
    stubGitHubApi(calls)

    const response = await postCommit(glyphFiles(120))
    expect(response.status).toBe(200)

    expect(
      calls.filter((call) => call.url.endsWith('/git/blobs'))
    ).toHaveLength(0)
    const treeCalls = calls.filter(
      (call) => call.method === 'POST' && call.url.endsWith('/git/trees')
    )
    // 120 files over a chunk size of 100
    expect(treeCalls).toHaveLength(2)
    expect(treeCalls[0].body?.base_tree).toBe('base-tree')
    // each chunk builds on the previous tree so no file is dropped
    expect(treeCalls[1].body?.base_tree).toBe('tree-1')
    expect(
      treeCalls.flatMap((call) => call.body?.tree as unknown[])
    ).toHaveLength(120)

    const commitCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/git/commits')
    )
    expect(commitCall?.body?.tree).toBe('tree-2')
  })

  // The repo owner always owns a same-named repository — their own — so a fork
  // lookup keyed on the name used to report "no fork" and block them.
  it('commits straight to the source repo when the viewer can push', async () => {
    const calls: RecordedCall[] = []
    canPushToSource = true
    viewerRepoIsFork = false
    stubGitHubApi(calls)

    const response = await postCommit(glyphFiles(1))
    expect(response.status).toBe(200)
    expect((await response.json()).headOwner).toBe('upstream')

    // never looks for a fork under the viewer's account
    expect(
      calls.filter((call) => call.url.includes('/repos/viewer/'))
    ).toHaveLength(0)
    expect(
      calls.filter(
        (call) => call.method === 'POST' && call.url.endsWith('/git/trees')
      )[0].url
    ).toBe('https://api.github.com/repos/upstream/font/git/trees')
  })

  it('rejects a commit that cannot finish within the platform limits', async () => {
    const calls: RecordedCall[] = []
    stubGitHubApi(calls)

    const response = await postCommit(glyphFiles(3001))
    expect(response.status).toBe(413)
    expect((await response.json()).error).toBe('too_many_files')
    // rejected before touching the GitHub API at all
    expect(calls).toHaveLength(0)
  })
})
