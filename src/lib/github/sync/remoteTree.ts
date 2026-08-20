import type { RemoteTreeSnapshot } from 'src/lib/github/sync/types'

interface RemoteTreeResponse {
  commitSha?: string
  truncated?: boolean
  entries?: Array<{ path?: string; sha?: string }>
  message?: string
}

export const fetchRemoteTree = async (input: {
  repo: string
  ref: string
}): Promise<RemoteTreeSnapshot> => {
  // self.location keeps this callable from a worker as well as the page.
  const url = new URL('/api/github/tree', self.location.origin)
  url.searchParams.set('repo', input.repo)
  url.searchParams.set('ref', input.ref)

  const response = await fetch(url.toString(), { credentials: 'include' })
  let payload: RemoteTreeResponse | null = null
  try {
    payload = (await response.json()) as RemoteTreeResponse
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.commitSha) {
    throw new Error(
      payload?.message || `讀取遠端 tree 失敗（HTTP ${response.status}）`
    )
  }

  const blobShaByPath = new Map<string, string>()
  for (const entry of payload.entries ?? []) {
    if (entry.path && entry.sha) {
      blobShaByPath.set(entry.path, entry.sha)
    }
  }

  return {
    commitSha: payload.commitSha,
    truncated: Boolean(payload.truncated),
    blobShaByPath,
  }
}
