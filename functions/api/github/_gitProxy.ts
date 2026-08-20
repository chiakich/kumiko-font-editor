// The browser cannot talk git-http to github.com directly (no CORS), so the
// smart-HTTP endpoints are proxied here. This module holds the pure routing and
// allowlist decisions so they can be tested without a network.

const REPO_SEGMENT = /^[A-Za-z0-9._-]+$/

// `.` and `..` satisfy REPO_SEGMENT but would build a path that resolves
// somewhere other than the named repository.
const isTraversalSegment = (segment: string) => /^\.+$/.test(segment)

const isValidRepoSegment = (segment: string | undefined) =>
  Boolean(segment) &&
  REPO_SEGMENT.test(segment!) &&
  !isTraversalSegment(segment!)

// Only the three smart-HTTP endpoints. Anything else must not be reachable
// through this proxy, or it becomes a general-purpose relay carrying the
// user's token.
const UPLOAD_PACK = 'git-upload-pack'
const RECEIVE_PACK = 'git-receive-pack'
const GIT_SERVICES = new Set([UPLOAD_PACK, RECEIVE_PACK])

export interface GitProxyRoute {
  owner: string
  repo: string
  upstreamUrl: string
  service: string
  // Fetch needs a packfile-aware content type on POST.
  contentType: string | null
  accept: string
}

export interface GitProxyRejection {
  status: number
  error: string
  message: string
}

export type GitProxyResolution =
  | { ok: true; route: GitProxyRoute }
  | { ok: false; rejection: GitProxyRejection }

const reject = (
  status: number,
  error: string,
  message: string
): GitProxyResolution => ({ ok: false, rejection: { status, error, message } })

export const resolveGitProxyRoute = (input: {
  segments: string[]
  method: string
  searchParams: URLSearchParams
}): GitProxyResolution => {
  const [owner, repo, ...rest] = input.segments
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) {
    return reject(400, 'invalid_repo', 'git proxy 路徑必須是 owner/repo')
  }

  const base = `https://github.com/${owner}/${repo.replace(/\.git$/, '')}.git`
  const method = input.method.toUpperCase()

  if (rest.length === 2 && rest[0] === 'info' && rest[1] === 'refs') {
    if (method !== 'GET') {
      return reject(405, 'method_not_allowed', 'info/refs 只接受 GET')
    }
    const service = input.searchParams.get('service') ?? ''
    if (!GIT_SERVICES.has(service)) {
      return reject(400, 'unsupported_service', '不支援的 git service')
    }
    return {
      ok: true,
      route: {
        owner,
        repo,
        upstreamUrl: `${base}/info/refs?service=${service}`,
        service,
        contentType: null,
        accept: `application/x-${service}-advertisement`,
      },
    }
  }

  if (rest.length === 1 && GIT_SERVICES.has(rest[0]!)) {
    if (method !== 'POST') {
      return reject(405, 'method_not_allowed', 'git service 只接受 POST')
    }
    const service = rest[0]!
    return {
      ok: true,
      route: {
        owner,
        repo,
        upstreamUrl: `${base}/${service}`,
        service,
        contentType: `application/x-${service}-request`,
        accept: `application/x-${service}-result`,
      },
    }
  }

  return reject(404, 'not_found', 'git proxy 只開放 smart HTTP 端點')
}

// Headers sent upstream are built from scratch: nothing the caller supplies is
// forwarded, so a client cannot override the injected credentials.
export const buildUpstreamHeaders = (input: {
  route: GitProxyRoute
  token: string
}) => {
  const headers = new Headers()
  // github.com's git endpoints only accept HTTP Basic — a Bearer token is
  // rejected as `invalid credentials` before the token is even looked at.
  // Bearer works on api.github.com, which is why the REST endpoints differ.
  headers.set('Authorization', `Basic ${btoa(`x-access-token:${input.token}`)}`)
  headers.set('User-Agent', 'Kumiko-Font-Editor')
  headers.set('Accept', input.route.accept)
  if (input.route.contentType) {
    headers.set('Content-Type', input.route.contentType)
  }
  return headers
}

// Only the content type is passed back; upstream cookies and auth-bearing
// headers must never reach the page.
export const buildDownstreamHeaders = (upstream: Headers) => {
  const headers = new Headers()
  const contentType = upstream.get('content-type')
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('Cache-Control', 'no-store')
  return headers
}
