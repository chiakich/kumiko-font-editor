export const getGitHubRepoUrl = (repoInput: string) => {
  const normalized = repoInput
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '')
  const [owner, repo] = normalized.split('/')

  if (!owner || !repo) {
    return null
  }

  return `https://github.com/${owner}/${repo}`
}

export const clearGitHubUrlParams = () => {
  const url = new URL(window.location.href)
  url.searchParams.delete('repo')
  url.searchParams.delete('ref')
  window.history.replaceState({}, '', url.toString())
}
