import { afterEach, describe, expect, it, vi } from 'vitest'

import { canScopesPush } from '../../functions/api/github/_utils'
import { onRequestGet } from '../../functions/api/github/viewer'

const viewerRequest = () =>
  onRequestGet({
    request: new Request('https://kumiko.test/api/github/viewer', {
      headers: { Authorization: 'Bearer token' },
    }),
    env: {},
  } as unknown as Parameters<typeof onRequestGet>[0]) as Promise<Response>

const stubUser = (scopes: string | null) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ login: 'chiakich', name: 'Chiaki' }), {
          status: 200,
          headers: scopes === null ? {} : { 'x-oauth-scopes': scopes },
        })
    )
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('canScopesPush', () => {
  it('accepts the scopes that allow writing to a repository', () => {
    expect(canScopesPush(['public_repo', 'read:user'])).toBe(true)
    expect(canScopesPush(['repo'])).toBe(true)
  })

  it('rejects read-only scopes', () => {
    // These authenticate fine; the failure only shows up as git denying the push
    expect(canScopesPush(['read:user', 'user:email'])).toBe(false)
    expect(canScopesPush([])).toBe(false)
  })
})

describe('viewer endpoint', () => {
  it('reports the granted scopes', async () => {
    stubUser('public_repo, read:user, user:email')

    const payload = await (await viewerRequest()).json()
    expect(payload.login).toBe('chiakich')
    expect(payload.scopes).toEqual(['public_repo', 'read:user', 'user:email'])
    expect(payload.canPush).toBe(true)
  })

  it('marks a token that cannot push', async () => {
    stubUser('read:user')

    expect((await (await viewerRequest()).json()).canPush).toBe(false)
  })

  it('treats a missing scope header as no scopes', async () => {
    // GitHub App installation tokens carry no x-oauth-scopes at all
    stubUser(null)

    const payload = await (await viewerRequest()).json()
    expect(payload.scopes).toEqual([])
    expect(payload.canPush).toBe(false)
  })
})
