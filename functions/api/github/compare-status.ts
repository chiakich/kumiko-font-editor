import type { PagesFunction } from '../../pages'
import {
  getCompareStatus,
  getCanonicalSourceRepo,
  isGitHubNotFound,
  json,
  parseRepoInput,
  readGitHubAccessToken,
  type Env,
} from './_utils'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const token = await readGitHubAccessToken(context.request, context.env)
  if (!token) {
    return json(
      { error: 'missing_token', message: '請先登入 GitHub。' },
      { status: 401 }
    )
  }

  const url = new URL(context.request.url)
  let parsedRepo: { owner: string; repo: string }
  try {
    parsedRepo = parseRepoInput(url.searchParams.get('repo'))
  } catch (error) {
    return json(
      {
        error: 'invalid_repo',
        message: error instanceof Error ? error.message : 'repo 參數格式錯誤',
      },
      { status: 400 }
    )
  }

  const headOwner = url.searchParams.get('headOwner')?.trim()
  const headBranch = url.searchParams.get('headBranch')?.trim()
  if (!headOwner || !headBranch) {
    return json(
      {
        error: 'invalid_compare_input',
        message: '缺少 headOwner 或 headBranch',
      },
      { status: 400 }
    )
  }

  try {
    const sourceRepo = await getCanonicalSourceRepo(
      token,
      parsedRepo.owner,
      parsedRepo.repo
    )
    // A draft branch that has not been pushed yet has nothing to compare, and
    // GitHub reports that as a 404. Answering 502 made the caller treat a
    // perfectly normal pre-first-send state as a server failure.
    const compare = await getCompareStatus({
      token,
      sourceOwner: sourceRepo.owner,
      repo: sourceRepo.repo,
      baseBranch: sourceRepo.defaultBranch,
      headOwner,
      headBranch,
    }).catch((error: unknown) => {
      if (isGitHubNotFound(error)) {
        return null
      }
      throw error
    })

    return json({
      sourceRepo,
      compare,
    })
  } catch (error) {
    return json(
      {
        error: 'compare_status_failed',
        message:
          error instanceof Error ? error.message : '讀取 compare 狀態失敗',
      },
      { status: 502 }
    )
  }
}
