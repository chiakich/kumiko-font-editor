import { describe, expect, it } from 'vitest'
import {
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  resolveGitProxyRoute,
} from '../../functions/api/github/_gitProxy'

const resolve = (path: string, method = 'GET', query = '') =>
  resolveGitProxyRoute({
    segments: path.split('/').filter(Boolean),
    method,
    searchParams: new URLSearchParams(query),
  })

describe('git proxy routing', () => {
  it('routes info/refs for both git services', () => {
    for (const service of ['git-upload-pack', 'git-receive-pack']) {
      const result = resolve(
        'owner/repo/info/refs',
        'GET',
        `service=${service}`
      )
      expect(result.ok).toBe(true)
      expect(result.ok && result.route.upstreamUrl).toBe(
        `https://github.com/owner/repo.git/info/refs?service=${service}`
      )
    }
  })

  it('routes the pack endpoints on POST', () => {
    const result = resolve('owner/repo/git-upload-pack', 'POST')
    expect(result.ok && result.route.upstreamUrl).toBe(
      'https://github.com/owner/repo.git/git-upload-pack'
    )
    expect(result.ok && result.route.contentType).toBe(
      'application/x-git-upload-pack-request'
    )
  })

  it('tolerates a .git suffix on the repo segment', () => {
    const result = resolve('owner/repo.git/git-upload-pack', 'POST')
    expect(result.ok && result.route.upstreamUrl).toBe(
      'https://github.com/owner/repo.git/git-upload-pack'
    )
  })

  it('refuses anything outside the smart HTTP endpoints', () => {
    for (const path of [
      'owner/repo',
      'owner/repo/HEAD',
      'owner/repo/objects/info/packs',
      'owner/repo/info/refs/extra',
      'owner',
    ]) {
      expect(resolve(path).ok).toBe(false)
    }
  })

  it('refuses traversal segments and slashes inside a segment', () => {
    for (const segments of [
      ['..', 'repo', 'git-upload-pack'],
      ['owner', '..', 'git-upload-pack'],
      ['.', 'repo', 'git-upload-pack'],
      ['owner', 'repo/../../evil', 'git-upload-pack'],
    ]) {
      expect(
        resolveGitProxyRoute({
          segments,
          method: 'POST',
          searchParams: new URLSearchParams(),
        }).ok
      ).toBe(false)
    }
  })

  it('always targets github.com for every accepted route', () => {
    for (const [path, method, query] of [
      ['owner/repo/info/refs', 'GET', 'service=git-upload-pack'],
      ['owner/repo/git-upload-pack', 'POST', ''],
      ['owner/repo/git-receive-pack', 'POST', ''],
    ] as const) {
      const result = resolve(path, method, query)
      expect(result.ok).toBe(true)
      expect(result.ok && new URL(result.route.upstreamUrl).origin).toBe(
        'https://github.com'
      )
    }
  })

  it('rejects an unknown or missing service on info/refs', () => {
    expect(resolve('owner/repo/info/refs', 'GET', 'service=evil').ok).toBe(
      false
    )
    expect(resolve('owner/repo/info/refs', 'GET').ok).toBe(false)
  })

  it('pins each endpoint to its method', () => {
    expect(
      resolve('owner/repo/info/refs', 'POST', 'service=git-upload-pack').ok
    ).toBe(false)
    expect(resolve('owner/repo/git-upload-pack', 'GET').ok).toBe(false)
  })
})

describe('git proxy headers', () => {
  it('injects the token and never trusts caller headers', () => {
    const result = resolve('owner/repo/git-upload-pack', 'POST')
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    const headers = buildUpstreamHeaders({ route: result.route, token: 'tok' })

    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(headers.get('Accept')).toBe('application/x-git-upload-pack-result')
    expect(headers.get('Cookie')).toBeNull()
  })

  it('passes only the content type back to the page', () => {
    const upstream = new Headers({
      'content-type': 'application/x-git-upload-pack-result',
      'set-cookie': 'session=leak',
      'www-authenticate': 'Basic realm="github"',
    })

    const headers = buildDownstreamHeaders(upstream)

    expect(headers.get('Content-Type')).toBe(
      'application/x-git-upload-pack-result'
    )
    expect(headers.get('set-cookie')).toBeNull()
    expect(headers.get('www-authenticate')).toBeNull()
    expect(headers.get('Cache-Control')).toBe('no-store')
  })
})
