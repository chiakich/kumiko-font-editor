import type { PagesFunction } from '../../pages'
import {
  getCompareStatus,
  getCanonicalSourceRepo,
  findViewerForkRepo,
  githubApiJson,
  json,
  parseRepoInput,
  readGitHubAccessToken,
  sanitizeBranchName,
  type Env,
} from './_utils'

interface GitHubCommitFilePayload {
  path: string
  content?: string
  deleted?: boolean
}

interface GitHubCommitPayload {
  repo: string
  baseBranch: string
  commitMessage: string
  branchName?: string
  files: GitHubCommitFilePayload[]
}

// Each chunk is one subrequest carrying that many files' contents; the platform
// caps subrequests per request, and GitHub rejects oversized tree bodies.
const COMMIT_TREE_CHUNK_SIZE = 100
const COMMIT_MAX_FILES = 3000

const loadBranchRef = async (
  token: string,
  owner: string,
  repo: string,
  branch: string
) => {
  try {
    return await githubApiJson<{ object: { sha: string } }>(
      token,
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
    )
  } catch {
    return null
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const token = await readGitHubAccessToken(context.request, context.env)
  if (!token) {
    return json(
      { error: 'missing_token', message: 'commit 前請先登入 GitHub。' },
      { status: 401 }
    )
  }

  let payload: GitHubCommitPayload
  try {
    payload = (await context.request.json()) as GitHubCommitPayload
  } catch {
    return json(
      { error: 'invalid_json', message: '請求 body 必須是 JSON' },
      { status: 400 }
    )
  }

  if (!payload.repo || !payload.baseBranch || !payload.commitMessage) {
    return json(
      {
        error: 'invalid_payload',
        message: '缺少 repo、baseBranch 或 commitMessage',
      },
      { status: 400 }
    )
  }

  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    return json(
      {
        error: 'empty_files',
        message: '沒有可提交的檔案變更',
      },
      { status: 400 }
    )
  }

  // Beyond this the request cannot finish inside the platform's limits; say so
  // instead of letting it die as an opaque 502.
  if (payload.files.length > COMMIT_MAX_FILES) {
    return json(
      {
        error: 'too_many_files',
        message: `這次變更有 ${payload.files.length} 個檔案，超過單次 commit 上限 ${COMMIT_MAX_FILES}；請分批同步，或改用 git 同步推送。`,
      },
      { status: 413 }
    )
  }

  let parsedRepo: { owner: string; repo: string }
  try {
    parsedRepo = parseRepoInput(payload.repo)
  } catch (error) {
    return json(
      {
        error: 'invalid_repo',
        message: error instanceof Error ? error.message : 'repo 參數格式錯誤',
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
    const forkInfo = await findViewerForkRepo(
      token,
      sourceRepo.owner,
      sourceRepo.repo
    )
    const targetRepo = forkInfo.targetRepo

    if (!targetRepo) {
      throw new Error('尚未找到你的 fork，請先建立 fork。')
    }

    const branchName = sanitizeBranchName(
      payload.branchName || `kumiko/patch-${Date.now()}`
    )
    if (!branchName) {
      throw new Error('請輸入有效的 branch 名稱')
    }

    const existingBranchRef = await loadBranchRef(
      token,
      targetRepo.owner,
      targetRepo.repo,
      branchName
    )

    let parentCommitSha = ''
    let baseTreeSha = ''

    if (existingBranchRef) {
      parentCommitSha = existingBranchRef.object.sha
      const branchCommit = await githubApiJson<{
        tree: { sha: string }
      }>(
        token,
        `/repos/${targetRepo.owner}/${targetRepo.repo}/git/commits/${parentCommitSha}`
      )
      baseTreeSha = branchCommit.tree.sha
    } else {
      const baseRef = await githubApiJson<{ object: { sha: string } }>(
        token,
        `/repos/${targetRepo.owner}/${targetRepo.repo}/git/ref/heads/${encodeURIComponent(payload.baseBranch)}`
      )
      parentCommitSha = baseRef.object.sha
      const baseCommit = await githubApiJson<{
        tree: { sha: string }
      }>(
        token,
        `/repos/${targetRepo.owner}/${targetRepo.repo}/git/commits/${parentCommitSha}`
      )
      baseTreeSha = baseCommit.tree.sha

      await githubApiJson(
        token,
        `/repos/${targetRepo.owner}/${targetRepo.repo}/git/refs`,
        {
          method: 'POST',
          body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: parentCommitSha,
          }),
        }
      )
    }

    // Inline file contents in the tree instead of creating one blob per file:
    // a blob POST per file blows the platform's per-request subrequest budget
    // as soon as a commit touches a few dozen glyphs. Chunked so both the
    // subrequest count and each request body stay bounded.
    const treeEntries = payload.files.map((file) =>
      file.deleted
        ? { path: file.path, mode: '100644', type: 'blob', sha: null }
        : {
            path: file.path,
            mode: '100644',
            type: 'blob',
            content: file.content ?? '',
          }
    )

    let treeSha = baseTreeSha
    for (
      let index = 0;
      index < treeEntries.length;
      index += COMMIT_TREE_CHUNK_SIZE
    ) {
      const createdTree = await githubApiJson<{ sha: string }>(
        token,
        `/repos/${targetRepo.owner}/${targetRepo.repo}/git/trees`,
        {
          method: 'POST',
          body: JSON.stringify({
            base_tree: treeSha,
            tree: treeEntries.slice(index, index + COMMIT_TREE_CHUNK_SIZE),
          }),
        }
      )
      treeSha = createdTree.sha
    }

    const createdCommit = await githubApiJson<{ sha: string }>(
      token,
      `/repos/${targetRepo.owner}/${targetRepo.repo}/git/commits`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: payload.commitMessage,
          tree: treeSha,
          parents: [parentCommitSha],
        }),
      }
    )

    await githubApiJson(
      token,
      `/repos/${targetRepo.owner}/${targetRepo.repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sha: createdCommit.sha,
          force: false,
        }),
      }
    )

    const compare = await getCompareStatus({
      token,
      sourceOwner: sourceRepo.owner,
      repo: sourceRepo.repo,
      baseBranch: payload.baseBranch,
      headOwner: targetRepo.owner,
      headBranch: branchName,
    })

    return json({
      ok: true,
      branchName,
      headOwner: targetRepo.owner,
      commitSha: createdCommit.sha,
      compare,
    })
  } catch (error) {
    return json(
      {
        error: 'commit_failed',
        message:
          error instanceof Error ? error.message : '建立 GitHub commit 失敗',
      },
      { status: 502 }
    )
  }
}
