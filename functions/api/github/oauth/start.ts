import type { PagesFunction } from '../../../pages'
import { createOAuthState, createStateCookieHeader, type Env } from '../_utils'

export const DEFAULT_OAUTH_SCOPE = 'public_repo read:user user:email'

// A scope name is a word, optionally one colon and another word (`read:user`).
// Anything else is not a scope GitHub can parse.
const SCOPE_NAME = /^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$/

// GitHub silently grants nothing when the scope string is unparseable — the
// token then authenticates fine and only fails when git refuses the push. A
// configured value that lost its separators (`public_reporead:useruser:email`)
// is indistinguishable from a real scope to the OAuth endpoint, so it is
// checked here instead.
export const resolveOAuthScope = (configured: string | undefined) => {
  const requested = (configured ?? '').split(/[\s,]+/).filter(Boolean)
  const valid = requested.filter((scope) => SCOPE_NAME.test(scope))
  return valid.length === requested.length && valid.length > 0
    ? valid.join(' ')
    : DEFAULT_OAUTH_SCOPE
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const clientId = context.env.GITHUB_CLIENT_ID?.trim()
  if (!clientId) {
    return new Response('Cloudflare 環境變數 GITHUB_CLIENT_ID 尚未設定', {
      status: 500,
    })
  }

  const requestUrl = new URL(context.request.url)
  const popupMode = requestUrl.searchParams.get('popup') === '1'
  const redirectUri = `${requestUrl.origin}/api/github/oauth/callback${popupMode ? '?popup=1' : ''}`
  const scope = resolveOAuthScope(context.env.GITHUB_OAUTH_SCOPE)
  const state = createOAuthState()

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', scope)
  authorizeUrl.searchParams.set('state', state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Set-Cookie': createStateCookieHeader(state),
    },
  })
}
