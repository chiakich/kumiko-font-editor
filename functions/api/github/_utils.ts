export interface Env {
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  GITHUB_SESSION_SECRET?: string
  GITHUB_OAUTH_SCOPE?: string
}

export interface AccessTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

export interface RepoMetadataResponse {
  title: string
  defaultBranch: string | null
  repoUrl: string
}

export interface GitHubViewerResponse {
  login: string
  avatar_url?: string
  html_url?: string
  name?: string | null
}

export interface GitHubRepoSummary {
  owner: string
  repo: string
  fullName: string
  defaultBranch: string
  htmlUrl: string
  canPush: boolean
}

interface GitHubRepoApiResponse {
  name?: string
  full_name?: string
  default_branch?: string
  html_url?: string
  fork?: boolean
  owner?: {
    login?: string
  }
  parent?: {
    full_name?: string
  }
  permissions?: {
    pull?: boolean
    push?: boolean
    admin?: boolean
  }
}

const buildRepoSummaryFromPayload = (
  owner: string,
  repo: string,
  payload: GitHubRepoApiResponse
): GitHubRepoSummary => ({
  owner: payload.owner?.login ?? owner,
  repo: payload.name ?? repo,
  fullName: payload.full_name ?? `${owner}/${repo}`,
  defaultBranch: payload.default_branch ?? 'main',
  htmlUrl: payload.html_url ?? `https://github.com/${owner}/${repo}`,
  canPush: Boolean(payload.permissions?.push || payload.permissions?.admin),
})

interface GitHubSessionPayload {
  accessToken: string
}

const GITHUB_SESSION_COOKIE = 'kumiko_github_session'
const GITHUB_STATE_COOKIE = 'kumiko_github_oauth_state'

export const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  })

export const readBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null
  }
  return authorization.slice('bearer '.length).trim() || null
}

const encodeBase64Url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(`${normalized}${padding}`)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const signValue = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(value)
  )
  return encodeBase64Url(new Uint8Array(signature))
}

const parseCookies = (request: Request) => {
  const rawCookie = request.headers.get('cookie') ?? ''
  return Object.fromEntries(
    rawCookie
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=')
        if (separatorIndex < 0) {
          return [entry, '']
        }
        return [
          entry.slice(0, separatorIndex),
          decodeURIComponent(entry.slice(separatorIndex + 1)),
        ]
      })
  )
}

const serializeCookie = (
  name: string,
  value: string,
  options?: {
    maxAge?: number
    httpOnly?: boolean
    sameSite?: 'Lax' | 'Strict' | 'None'
    secure?: boolean
    path?: string
  }
) => {
  const segments = [`${name}=${encodeURIComponent(value)}`]
  segments.push(`Path=${options?.path ?? '/'}`)
  segments.push(`SameSite=${options?.sameSite ?? 'Lax'}`)
  if (options?.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`)
  }
  if (options?.httpOnly ?? true) {
    segments.push('HttpOnly')
  }
  if (options?.secure ?? true) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

const clearCookieHeader = (name: string) =>
  serializeCookie(name, '', {
    maxAge: 0,
  })

const randomHex = (byteLength = 16) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

export const createOAuthState = () => randomHex(18)

export const createStateCookieHeader = (state: string) =>
  serializeCookie(GITHUB_STATE_COOKIE, state, {
    maxAge: 600,
  })

export const clearStateCookieHeader = () =>
  clearCookieHeader(GITHUB_STATE_COOKIE)

export const readOAuthState = (request: Request) =>
  parseCookies(request)[GITHUB_STATE_COOKIE] ?? null

export const createSessionCookieHeader = async (
  env: Env,
  payload: GitHubSessionPayload
) => {
  const secret = env.GITHUB_SESSION_SECRET?.trim()
  if (!secret) {
    throw new Error('Cloudflare 環境變數 GITHUB_SESSION_SECRET 尚未設定')
  }

  const encodedPayload = encodeBase64Url(
    textEncoder.encode(JSON.stringify(payload))
  )
  const signature = await signValue(secret, encodedPayload)
  return serializeCookie(
    GITHUB_SESSION_COOKIE,
    `${encodedPayload}.${signature}`,
    {
      maxAge: 60 * 60 * 24 * 7,
    }
  )
}

export const clearSessionCookieHeader = () =>
  clearCookieHeader(GITHUB_SESSION_COOKIE)

const readSessionPayload = async (
  request: Request,
  env: Env
): Promise<GitHubSessionPayload | null> => {
  const secret = env.GITHUB_SESSION_SECRET?.trim()
  if (!secret) {
    return null
  }

  const rawValue = parseCookies(request)[GITHUB_SESSION_COOKIE]
  if (!rawValue) {
    return null
  }

  const [encodedPayload, providedSignature] = rawValue.split('.')
  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = await signValue(secret, encodedPayload)
  if (expectedSignature !== providedSignature) {
    return null
  }

  try {
    return JSON.parse(
      textDecoder.decode(decodeBase64Url(encodedPayload))
    ) as GitHubSessionPayload
  } catch {
    return null
  }
}

export const readGitHubAccessToken = async (request: Request, env: Env) => {
  const bearerToken = readBearerToken(request)
  if (bearerToken) {
    return bearerToken
  }

  const sessionPayload = await readSessionPayload(request, env)
  return sessionPayload?.accessToken ?? null
}

export const githubApiFetch = async (
  token: string,
  path: string,
  init?: RequestInit
) => {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  headers.set('User-Agent', 'Kumiko-Font-Editor')

  if (
    init?.body &&
    !headers.has('Content-Type') &&
    !(init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
  })
}

export const githubApiJson = async <T>(
  token: string,
  path: string,
  init?: RequestInit
) => {
  const response = await githubApiFetch(token, path, init)
  const rawText = await response.text()
  let payload: (T & { message?: string }) | null = null

  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText) as T & { message?: string }
    } catch {
      payload = {
        message: rawText.trim().slice(0, 500),
      } as T & { message?: string }
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.message || `GitHub API 失敗（HTTP ${response.status}）`
    )
  }

  return payload as T
}

// GitHub reports the granted scopes on every API response. A token without a
// write scope authenticates fine and only fails at push time, with git's raw
// "Permission to X denied to Y" — so the scopes are read here and surfaced.
export const getGitHubViewerWithScopes = async (token: string) => {
  const response = await githubApiFetch(token, '/user')
  const rawText = await response.text()
  if (!response.ok) {
    let message: string | undefined
    try {
      message = (JSON.parse(rawText) as { message?: string }).message
    } catch {
      message = rawText.trim().slice(0, 200)
    }
    throw new Error(message || `GitHub API 失敗（HTTP ${response.status}）`)
  }
  return {
    viewer: JSON.parse(rawText) as GitHubViewerResponse,
    scopes: (response.headers.get('x-oauth-scopes') ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
  }
}

// Pushing needs one of these; `repo` also covers private repositories.
export const canScopesPush = (scopes: readonly string[]) =>
  scopes.includes('repo') || scopes.includes('public_repo')

export const getGitHubViewer = async (token: string) =>
  githubApiJson<GitHubViewerResponse>(token, '/user')

export const sanitizeBranchName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '')

export const parseRepoInput = (value: string | null) => {
  if (!value) {
    throw new Error('缺少 repo 參數')
  }

  const trimmed = value.trim()
  const normalized = trimmed
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length < 2) {
    throw new Error('repo 參數必須是 owner/repo 或 GitHub repo URL')
  }

  return {
    owner: segments[0]!,
    repo: segments[1]!.replace(/\.git$/i, ''),
  }
}

const DEFAULT_REF_CANDIDATES = ['main', 'master']

const parseDefaultBranchFromHtml = (html: string) => {
  const patterns = [
    /"defaultBranch":"([^"]+)"/,
    /octolytics-dimension-repository_default_branch" content="([^"]+)"/,
    /"default_branch":"([^"]+)"/,
    /\/commits\/([A-Za-z0-9._/-]+)"/,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    const value = match?.[1]?.trim()
    if (value) {
      return value
    }
  }

  return null
}

const parseRepoTitleFromHtml = (html: string, fallbackRepo: string) => {
  const ogTitleMatch = html.match(
    /<meta property="og:title" content="([^"]+)"/i
  )
  const ogTitle = ogTitleMatch?.[1]?.trim()
  if (!ogTitle) {
    return fallbackRepo
  }

  const [repoTitle] = ogTitle.split(':')
  return repoTitle?.split('/').pop()?.trim() || fallbackRepo
}

export const fetchRepoMetadata = async (input: {
  owner: string
  repo: string
  token?: string | null
}): Promise<RepoMetadataResponse> => {
  if (input.token) {
    const response = await githubApiFetch(
      input.token,
      `/repos/${input.owner}/${input.repo}`
    )

    if (response.ok) {
      const payload = (await response.json()) as {
        default_branch?: string
        html_url?: string
        name?: string
      }
      return {
        title: payload.name ?? input.repo,
        defaultBranch: payload.default_branch ?? null,
        repoUrl:
          payload.html_url ?? `https://github.com/${input.owner}/${input.repo}`,
      }
    }
  }

  const repoUrl = `https://github.com/${input.owner}/${input.repo}`
  const response = await fetch(repoUrl)
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? '找不到指定的 GitHub repo，請確認 owner/repo 是否正確'
        : `讀取 GitHub repo 頁面失敗（HTTP ${response.status}）`
    )
  }

  const html = await response.text()
  return {
    title: parseRepoTitleFromHtml(html, input.repo),
    defaultBranch: parseDefaultBranchFromHtml(html),
    repoUrl: response.url || repoUrl,
  }
}

export const getRepoSummary = async (
  token: string,
  owner: string,
  repo: string
): Promise<GitHubRepoSummary> => {
  const payload = await githubApiJson<GitHubRepoApiResponse>(
    token,
    `/repos/${owner}/${repo}`
  )

  return buildRepoSummaryFromPayload(owner, repo, payload)
}

export const getCanonicalSourceRepo = async (
  token: string,
  owner: string,
  repo: string
) => {
  const payload = await githubApiJson<GitHubRepoApiResponse>(
    token,
    `/repos/${owner}/${repo}`
  )

  if (payload.fork && payload.parent?.full_name) {
    const [parentOwner, parentRepo] = payload.parent.full_name.split('/')
    if (parentOwner && parentRepo) {
      return getRepoSummary(token, parentOwner, parentRepo)
    }
  }

  return buildRepoSummaryFromPayload(owner, repo, payload)
}

export const findViewerForkRepo = async (
  token: string,
  sourceOwner: string,
  repo: string
) => {
  const viewer = await getGitHubViewer(token)
  const viewerLogin = viewer.login?.trim()
  if (!viewerLogin) {
    throw new Error('讀取目前 GitHub 使用者失敗')
  }

  const sourceRepo = await getRepoSummary(token, sourceOwner, repo)

  // Write access makes a fork unnecessary, and it has to be checked first: the
  // viewer may own an unrelated repository of the same name — the repo owner
  // always does — which would otherwise read as "no fork" and block committing.
  if (sourceRepo.canPush) {
    return {
      viewerLogin,
      targetRepo: sourceRepo,
      forked: false,
      canDirectCommit: true,
    }
  }

  try {
    const payload = await githubApiJson<GitHubRepoApiResponse>(
      token,
      `/repos/${viewerLogin}/${repo}`
    )
    if (payload.parent?.full_name !== `${sourceOwner}/${repo}`) {
      return {
        viewerLogin,
        targetRepo: null,
        forked: false,
        canDirectCommit: false,
      }
    }

    return {
      viewerLogin,
      targetRepo: {
        owner: payload.owner?.login ?? viewerLogin,
        repo: payload.name ?? repo,
        fullName: payload.full_name ?? `${viewerLogin}/${repo}`,
        defaultBranch: payload.default_branch ?? 'main',
        htmlUrl:
          payload.html_url ?? `https://github.com/${viewerLogin}/${repo}`,
        canPush: Boolean(
          payload.permissions?.push || payload.permissions?.admin
        ),
      },
      forked: true,
      canDirectCommit: false,
    }
  } catch {
    // No fork yet, and no write access either.
    return {
      viewerLogin,
      targetRepo: null,
      forked: false,
      canDirectCommit: false,
    }
  }
}

export const createViewerForkRepo = async (
  token: string,
  sourceOwner: string,
  repo: string
) => {
  const viewer = await getGitHubViewer(token)
  const viewerLogin = viewer.login?.trim()
  if (!viewerLogin) {
    throw new Error('讀取目前 GitHub 使用者失敗')
  }

  const sourceRepo = await getRepoSummary(token, sourceOwner, repo)

  const loadViewerForkRepo = async () => {
    const payload = await githubApiJson<GitHubRepoApiResponse>(
      token,
      `/repos/${viewerLogin}/${repo}`
    )

    if (payload.parent?.full_name !== `${sourceOwner}/${repo}`) {
      return null
    }

    return {
      viewerLogin,
      targetRepo: {
        owner: payload.owner?.login ?? viewerLogin,
        repo: payload.name ?? repo,
        fullName: payload.full_name ?? `${viewerLogin}/${repo}`,
        defaultBranch: payload.default_branch ?? 'main',
        htmlUrl:
          payload.html_url ?? `https://github.com/${viewerLogin}/${repo}`,
        canPush: Boolean(
          payload.permissions?.push || payload.permissions?.admin
        ),
      },
      forked: true,
      canDirectCommit: false,
    }
  }

  try {
    const existingFork = await loadViewerForkRepo()
    if (existingFork) {
      return existingFork
    }
  } catch {
    // Continue to create a fork below.
  }

  if (viewerLogin === sourceOwner) {
    return {
      viewerLogin,
      targetRepo: sourceRepo,
      forked: false,
      canDirectCommit: true,
    }
  }

  await githubApiJson(token, `/repos/${sourceOwner}/${repo}/forks`, {
    method: 'POST',
  })

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const nextFork = await loadViewerForkRepo()
      if (nextFork) {
        return nextFork
      }
    } catch {
      // Fork may still be provisioning.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new Error('GitHub fork 尚未準備完成，請稍後再試一次')
}

export const getViewerPreferredRepo = async (
  token: string,
  sourceOwner: string,
  repo: string
) => {
  const existing = await findViewerForkRepo(token, sourceOwner, repo)
  if (existing.targetRepo) {
    return existing
  }
  return existing
}

export const listRepoBranches = async (
  token: string,
  owner: string,
  repo: string
) => {
  const payload = await githubApiJson<Array<{ name?: string }>>(
    token,
    `/repos/${owner}/${repo}/branches?per_page=100`
  )
  return payload
    .map((branch) => branch.name?.trim())
    .filter((branch): branch is string => Boolean(branch))
}

export const buildCompareUrl = (input: {
  sourceOwner: string
  repo: string
  baseBranch: string
  headOwner: string
  headBranch: string
  title?: string
  body?: string
}) => {
  const compareUrl = new URL(
    `https://github.com/${input.sourceOwner}/${input.repo}/compare/${encodeURIComponent(input.baseBranch)}...${encodeURIComponent(`${input.headOwner}:${input.headBranch}`)}`
  )
  compareUrl.searchParams.set('expand', '1')
  compareUrl.searchParams.set('quick_pull', '1')
  if (input.title?.trim()) {
    compareUrl.searchParams.set('title', input.title.trim())
  }
  if (input.body?.trim()) {
    compareUrl.searchParams.set('body', input.body)
  }
  return compareUrl.toString()
}

export const getCompareStatus = async (input: {
  token: string
  sourceOwner: string
  repo: string
  baseBranch: string
  headOwner: string
  headBranch: string
  title?: string
  body?: string
}) => {
  if (
    input.sourceOwner === input.headOwner &&
    input.baseBranch === input.headBranch
  ) {
    return {
      status: 'identical',
      aheadBy: 0,
      behindBy: 0,
      compareUrl: buildCompareUrl(input),
    }
  }

  const payload = await githubApiJson<{
    status?: string
    ahead_by?: number
    behind_by?: number
  }>(
    input.token,
    `/repos/${input.sourceOwner}/${input.repo}/compare/${encodeURIComponent(input.baseBranch)}...${encodeURIComponent(`${input.headOwner}:${input.headBranch}`)}`
  )

  return {
    status: payload.status ?? 'unknown',
    aheadBy: payload.ahead_by ?? 0,
    behindBy: payload.behind_by ?? 0,
    compareUrl: buildCompareUrl(input),
  }
}

export const buildArchiveAttempts = (input: {
  owner: string
  repo: string
  explicitRef?: string | null
  defaultBranch?: string | null
  token?: string | null
}) => {
  const refsToTry = input.explicitRef?.trim()
    ? [input.explicitRef.trim()]
    : [input.defaultBranch, ...DEFAULT_REF_CANDIDATES].filter(
        (value, index, list): value is string =>
          Boolean(value) && list.indexOf(value) === index
      )

  const attempts: Array<{ ref: string; url: string; useAuth: boolean }> = []
  for (const ref of refsToTry) {
    if (input.token) {
      attempts.push({
        ref,
        url: `https://api.github.com/repos/${input.owner}/${input.repo}/zipball/${encodeURIComponent(ref)}`,
        useAuth: true,
      })
    }

    attempts.push({
      ref,
      url: `https://codeload.github.com/${input.owner}/${input.repo}/zip/refs/heads/${encodeURIComponent(ref)}`,
      useAuth: false,
    })
    attempts.push({
      ref,
      url: `https://codeload.github.com/${input.owner}/${input.repo}/zip/refs/tags/${encodeURIComponent(ref)}`,
      useAuth: false,
    })
    attempts.push({
      ref,
      url: `https://github.com/${input.owner}/${input.repo}/archive/${encodeURIComponent(ref)}.zip`,
      useAuth: false,
    })
  }

  return attempts
}
