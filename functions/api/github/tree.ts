import type { PagesFunction } from '../../pages'
import { json, parseRepoInput, readGitHubAccessToken, type Env } from './_utils'

const SYNCABLE_EXTENSIONS = ['.glif', '.plist', '.fea']

interface GitHubCommitResponse {
  sha?: string
  commit?: { tree?: { sha?: string } }
  message?: string
}

interface GitHubTreeResponse {
  truncated?: boolean
  tree?: Array<{ path?: string; type?: string; sha?: string }>
  message?: string
}

// Works for both anonymous viewers (public repos) and signed-in users.
const githubGetJson = async <T>(token: string | null, path: string) => {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Kumiko-Font-Editor',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`https://api.github.com${path}`, { headers })
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null
  if (!response.ok) {
    throw new Error(
      payload?.message || `GitHub API 失敗（HTTP ${response.status}）`
    )
  }
  return payload as T
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  let parsed: { owner: string; repo: string }

  try {
    parsed = parseRepoInput(url.searchParams.get('repo'))
  } catch (error) {
    return json(
      {
        error: 'invalid_repo',
        message: error instanceof Error ? error.message : 'repo 參數格式錯誤',
      },
      { status: 400 }
    )
  }

  const ref = url.searchParams.get('ref')?.trim()
  if (!ref) {
    return json(
      { error: 'missing_ref', message: '缺少 ref 參數' },
      { status: 400 }
    )
  }

  const token = await readGitHubAccessToken(context.request, context.env)

  try {
    const commit = await githubGetJson<GitHubCommitResponse>(
      token,
      `/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(ref)}`
    )
    const commitSha = commit.sha
    const treeSha = commit.commit?.tree?.sha
    if (!commitSha || !treeSha) {
      throw new Error('無法解析指定 ref 對應的 commit')
    }

    const tree = await githubGetJson<GitHubTreeResponse>(
      token,
      `/repos/${parsed.owner}/${parsed.repo}/git/trees/${treeSha}?recursive=1`
    )

    const entries = (tree.tree ?? [])
      .filter(
        (entry) =>
          entry.type === 'blob' &&
          entry.path &&
          entry.sha &&
          SYNCABLE_EXTENSIONS.some((extension) =>
            entry.path!.toLowerCase().endsWith(extension)
          )
      )
      .map((entry) => ({ path: entry.path, sha: entry.sha }))

    return json({
      commitSha,
      truncated: Boolean(tree.truncated),
      entries,
    })
  } catch (error) {
    return json(
      {
        error: 'tree_failed',
        message:
          error instanceof Error ? error.message : '讀取 GitHub tree 失敗',
      },
      { status: 502 }
    )
  }
}
