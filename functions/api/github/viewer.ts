import type { PagesFunction } from '../../pages'
import {
  canScopesPush,
  getGitHubViewerWithScopes,
  json,
  readGitHubAccessToken,
  type Env,
} from './_utils'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = await readGitHubAccessToken(context.request, context.env)
  if (!token) {
    return json(
      { error: 'missing_token', message: '缺少 GitHub access token' },
      { status: 401 }
    )
  }

  try {
    const { viewer, scopes } = await getGitHubViewerWithScopes(token)
    return json({
      id: typeof viewer.id === 'number' ? viewer.id : null,
      login: viewer.login ?? null,
      avatarUrl: viewer.avatar_url ?? null,
      profileUrl: viewer.html_url ?? null,
      name: viewer.name ?? null,
      scopes,
      canPush: canScopesPush(scopes),
    })
  } catch (error) {
    return json(
      {
        error: 'viewer_fetch_failed',
        message:
          error instanceof Error ? error.message : '讀取 GitHub 使用者資訊失敗',
      },
      { status: 502 }
    )
  }
}
