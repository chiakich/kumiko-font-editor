import { afterEach, describe, expect, it, vi } from 'vitest'

import { onRequestGet } from '../../functions/api/github/fork-status'

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const stubGitHubApi = (
  calls: string[],
  options?: { compareStatus?: number }
) => {
  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)

    if (url === 'https://api.github.com/user') {
      return jsonResponse({ login: 'chiakich' })
    }
    if (url === 'https://api.github.com/repos/chiakich/JYRounded') {
      return jsonResponse({
        name: 'JYRounded',
        full_name: 'chiakich/JYRounded',
        owner: { login: 'chiakich' },
        default_branch: 'main',
        permissions: { push: true },
      })
    }
    if (
      url.startsWith('https://api.github.com/repos/chiakich/JYRounded/branches')
    ) {
      return jsonResponse([{ name: 'main' }])
    }
    if (url.includes('/compare/')) {
      return options?.compareStatus === 404
        ? jsonResponse({ message: 'Not Found' }, 404)
        : jsonResponse({ status: 'ahead', ahead_by: 1, behind_by: 0 })
    }

    throw new Error(`unstubbed ${url}`)
  }

  vi.stubGlobal('fetch', vi.fn(handler))
}

const getForkStatus = (branch: string) =>
  onRequestGet({
    request: new Request(
      `https://kumiko.test/api/github/fork-status?repo=chiakich%2FJYRounded&branch=${encodeURIComponent(branch)}`,
      { headers: { Authorization: 'Bearer token' } }
    ),
    env: {},
  } as unknown as Parameters<typeof onRequestGet>[0]) as Promise<Response>

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fork status', () => {
  // A draft branch is named before it is ever pushed, and comparing against it
  // answers 404. That used to fail the whole endpoint with a 502, leaving the
  // send panel with no fork status at all.
  it('answers with no comparison for a draft branch that is not on the remote', async () => {
    const calls: string[] = []
    stubGitHubApi(calls)

    const response = await getForkStatus('kumiko/a')
    const payload = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(payload.compare).toBeNull()
    expect(calls.some((call) => call.includes('/compare/'))).toBe(false)
  })

  it('reports write access on a repo the viewer owns', async () => {
    stubGitHubApi([])

    const payload = (await (await getForkStatus('main')).json()) as {
      canDirectCommit: boolean
      sourceRepo: { canPush: boolean }
      targetRepo: { canPush: boolean } | null
    }

    expect(payload.canDirectCommit).toBe(true)
    expect(payload.sourceRepo.canPush).toBe(true)
    expect(payload.targetRepo?.canPush).toBe(true)
  })

  it('still compares a branch the remote has', async () => {
    const calls: string[] = []
    stubGitHubApi(calls)

    const payload = (await (await getForkStatus('main')).json()) as {
      compare: { aheadBy: number } | null
    }

    // main is the default branch on both sides, so it short-circuits as identical.
    expect(payload.compare).not.toBeNull()
  })

  // A 404 can still race in between listing branches and comparing.
  it('tolerates a comparison that 404s anyway', async () => {
    const calls: string[] = []
    stubGitHubApi(calls, { compareStatus: 404 })

    const response = await getForkStatus('main')
    expect(response.status).toBe(200)
  })
})
