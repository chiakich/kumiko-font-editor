import { unzipSync } from 'fflate'
import {
  importUfoWorkspaceEntries,
  type UfoWorkspaceEntry,
} from 'src/lib/fontAdapters/ufo'
import type { UfoGithubSource } from 'src/lib/ufoTypes'

interface ParsedGitHubInput {
  owner: string
  repo: string
}

interface RepoMetadataResponse {
  title: string
  defaultBranch: string | null
  repoUrl: string
}

interface GitHubPublicRepoResponse {
  name?: string
  default_branch?: string
  html_url?: string
  visibility?: string
  private?: boolean
}

const GITHUB_REPO_PATTERN =
  /^(?:https?:\/\/github\.com\/)?(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git|\/)?$/

const normalizePath = (value: string) => value.replace(/\\/g, '/')

const parseGitHubRepoInput = (value: string): ParsedGitHubInput => {
  const trimmed = value.trim()
  const match = trimmed.match(GITHUB_REPO_PATTERN)
  const owner = match?.groups?.owner
  const repo = match?.groups?.repo

  if (!owner || !repo) {
    throw new Error('請輸入 `owner/repo` 或完整 GitHub repo URL')
  }

  return { owner, repo }
}

const decodeZipEntry = (path: string, bytes: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new Error(
      `無法解碼 ZIP 內的文字檔：${path}。${error instanceof Error ? error.message : '未知錯誤'}`
    )
  }
}

const collectUfoEntriesFromZip = (zipBuffer: Uint8Array) => {
  const archiveEntries = unzipSync(zipBuffer)
  const rawPaths = Object.keys(archiveEntries).filter((path) => path.length > 0)
  const archiveRoot = rawPaths[0]?.split('/')[0] ?? ''
  const ufoEntries: UfoWorkspaceEntry[] = []

  for (const [rawPath, bytes] of Object.entries(archiveEntries)) {
    const normalizedPath = normalizePath(rawPath)
    if (!normalizedPath || normalizedPath.endsWith('/')) {
      continue
    }

    const relativePath =
      archiveRoot && normalizedPath.startsWith(`${archiveRoot}/`)
        ? normalizedPath.slice(archiveRoot.length + 1)
        : normalizedPath

    if (!relativePath.toLowerCase().includes('.ufo/')) {
      continue
    }

    const normalizedLower = relativePath.toLowerCase()
    if (
      !normalizedLower.endsWith('.glif') &&
      !normalizedLower.endsWith('.plist') &&
      !normalizedLower.endsWith('.fea')
    ) {
      continue
    }

    ufoEntries.push({
      relativePath,
      text: decodeZipEntry(relativePath, bytes),
    })
  }

  return { archiveRoot, ufoEntries }
}

const parseResponseBody = async (response: Response) => {
  const rawText = await response.text()
  if (!rawText.trim()) {
    return null
  }

  try {
    return JSON.parse(rawText) as { message?: string }
  } catch {
    return {
      message: rawText.slice(0, 200),
    }
  }
}

const fetchJsonOrThrow = async <T>(response: Response) => {
  const payload = (await parseResponseBody(response)) as
    | (T & { message?: string })
    | null
  if (!payload) {
    throw new Error(
      response.ok
        ? 'API 沒有回傳 JSON。若你在本地開發，請改用 `pnpm cf:dev` 啟動 Cloudflare Pages Functions。'
        : `HTTP ${response.status}`
    )
  }
  if (!response.ok) {
    throw new Error(payload.message || `HTTP ${response.status}`)
  }
  return payload
}

const fetchPublicRepoMetadata = async (
  owner: string,
  repo: string
): Promise<RepoMetadataResponse | null> => {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`
    )
    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as GitHubPublicRepoResponse
    return {
      title: payload.name ?? repo,
      defaultBranch: payload.default_branch ?? null,
      repoUrl: payload.html_url ?? `https://github.com/${owner}/${repo}`,
    }
  } catch {
    return null
  }
}

export const importGitHubUfoRepo = async (input: {
  repo: string
  ref?: string
}) => {
  const parsed = parseGitHubRepoInput(input.repo)
  const publicRepoMetadata = await fetchPublicRepoMetadata(
    parsed.owner,
    parsed.repo
  )
  const repoMetadata = publicRepoMetadata
    ? publicRepoMetadata
    : await (async () => {
        const metadataResponse = await fetch(
          `/api/github/repo?repo=${encodeURIComponent(`${parsed.owner}/${parsed.repo}`)}`,
          {
            credentials: 'include',
          }
        )
        return fetchJsonOrThrow<RepoMetadataResponse>(metadataResponse)
      })()

  const archiveUrl = new URL('/api/github/archive', window.location.origin)
  archiveUrl.searchParams.set('repo', `${parsed.owner}/${parsed.repo}`)
  if (input.ref?.trim()) {
    archiveUrl.searchParams.set('ref', input.ref.trim())
  }

  const archiveResponse = await fetch(archiveUrl.toString(), {
    credentials: 'include',
  })
  if (!archiveResponse.ok) {
    const payload = await parseResponseBody(archiveResponse)
    throw new Error(
      payload?.message ||
        `下載 GitHub ZIP 失敗（HTTP ${archiveResponse.status}）`
    )
  }

  const zipBuffer = new Uint8Array(await archiveResponse.arrayBuffer())
  const resolvedRef =
    archiveResponse.headers.get('x-kumiko-github-ref') ??
    input.ref?.trim() ??
    repoMetadata.defaultBranch ??
    'unknown'
  const zipballUrl =
    archiveResponse.headers.get('x-kumiko-github-url') ?? archiveUrl.toString()

  const { archiveRoot, ufoEntries } = collectUfoEntriesFromZip(zipBuffer)
  if (ufoEntries.length === 0) {
    throw new Error('這個 repo 的 ZIP 檔裡沒有找到可解析的 UFO 專案')
  }

  const githubSource: UfoGithubSource = {
    owner: parsed.owner,
    repo: parsed.repo,
    ref: resolvedRef,
    defaultBranch: repoMetadata.defaultBranch ?? resolvedRef,
    repoUrl: repoMetadata.repoUrl,
    zipballUrl,
    archiveRoot,
    commitSha: null,
  }

  return importUfoWorkspaceEntries(ufoEntries, {
    title: repoMetadata.title,
    sourceFolderName: `${parsed.owner}/${parsed.repo}`,
    sourceType: 'github',
    githubSource,
  })
}
