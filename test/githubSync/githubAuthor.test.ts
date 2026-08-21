import { describe, expect, it } from 'vitest'
import { gitCommitAuthorForGitHubViewer } from 'src/lib/github/githubAuth'

describe('gitCommitAuthorForGitHubViewer', () => {
  it('uses GitHub’s ID-based noreply address for account attribution', () => {
    expect(
      gitCommitAuthorForGitHubViewer({
        id: 123,
        login: 'contributor',
        name: 'Contributor Name',
      })
    ).toEqual({
      name: 'Contributor Name',
      email: '123+contributor@users.noreply.github.com',
    })
  })

  it('falls back to the login as the author name', () => {
    expect(
      gitCommitAuthorForGitHubViewer({
        id: 123,
        login: 'contributor',
        name: null,
      })
    ).toMatchObject({ name: 'contributor' })
  })

  it('refuses incomplete account data rather than attributing to Kumiko', () => {
    expect(
      gitCommitAuthorForGitHubViewer({
        id: null,
        login: 'contributor',
        name: 'Contributor',
      })
    ).toBeNull()
  })
})
