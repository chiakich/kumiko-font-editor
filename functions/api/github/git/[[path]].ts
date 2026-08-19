import type { PagesFunction } from '../../../pages'
import {
  buildDownstreamHeaders,
  buildUpstreamHeaders,
  resolveGitProxyRoute,
} from '../_gitProxy'
import { json, readGitHubAccessToken, type Env } from '../_utils'

const handle: PagesFunction<Env> = async (context) => {
  const token = await readGitHubAccessToken(context.request, context.env)
  if (!token) {
    return json(
      { error: 'missing_token', message: '使用 git 同步前請先登入 GitHub。' },
      { status: 401 }
    )
  }

  const rawPath = context.params.path
  const segments = Array.isArray(rawPath)
    ? rawPath
    : String(rawPath ?? '')
        .split('/')
        .filter(Boolean)

  const url = new URL(context.request.url)
  const resolution = resolveGitProxyRoute({
    segments,
    method: context.request.method,
    searchParams: url.searchParams,
  })

  if (!resolution.ok) {
    const { status, ...body } = resolution.rejection
    return json(body, { status })
  }

  const upstream = await fetch(resolution.route.upstreamUrl, {
    method: context.request.method,
    headers: buildUpstreamHeaders({ route: resolution.route, token }),
    body: context.request.method === 'POST' ? context.request.body : undefined,
    // Required by the Workers runtime when streaming a request body.
    duplex: 'half',
  } as RequestInit)

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream.headers),
  })
}

export const onRequestGet = handle
export const onRequestPost = handle
