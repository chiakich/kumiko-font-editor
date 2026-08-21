import { describe, expect, it } from 'vitest'

import {
  DEFAULT_OAUTH_SCOPE,
  resolveOAuthScope,
} from '../../functions/api/github/oauth/start'

describe('resolveOAuthScope', () => {
  it('keeps a configured scope list', () => {
    expect(resolveOAuthScope('repo read:user')).toBe('repo read:user')
  })

  it('accepts comma separators and stray whitespace', () => {
    expect(resolveOAuthScope(' repo , read:user\n')).toBe('repo read:user')
  })

  it('falls back when the separators were lost', () => {
    // Observed in production: the configured value had its spaces stripped, so
    // GitHub saw one unknown scope, granted nothing, and every push was denied
    // by a token that authenticated perfectly well.
    expect(resolveOAuthScope('public_reporead:useruser:email')).toBe(
      DEFAULT_OAUTH_SCOPE
    )
  })

  it('falls back when nothing is configured', () => {
    expect(resolveOAuthScope(undefined)).toBe(DEFAULT_OAUTH_SCOPE)
    expect(resolveOAuthScope('   ')).toBe(DEFAULT_OAUTH_SCOPE)
  })

  it('does not silently drop part of a list', () => {
    // Half-valid input is a configuration mistake, not an intent to narrow the
    // grant; dropping the bad half would hide it.
    expect(resolveOAuthScope('repo bogus:scope:name')).toBe(DEFAULT_OAUTH_SCOPE)
  })
})
