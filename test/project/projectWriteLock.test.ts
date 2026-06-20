import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'
import {
  acquireProjectWriteLock,
  PROJECT_WRITE_LOCK_HEARTBEAT_MS,
  PROJECT_WRITE_LOCK_TTL_MS,
  releaseProjectWriteLock,
  renewProjectWriteLock,
  type ProjectWriteLockRecord,
} from 'src/lib/project/projectWriteLock'
import {
  loadKumikoUiValue,
  saveKumikoUiValue,
} from 'src/lib/project/kumikoProjectPersistence'

describe('project write lock', () => {
  it('uses a short stale fallback window for abandoned tabs', () => {
    expect(PROJECT_WRITE_LOCK_HEARTBEAT_MS).toBe(5_000)
    expect(PROJECT_WRITE_LOCK_TTL_MS).toBe(15_000)
  })

  it('acquires and releases a project lock', async () => {
    const first = await acquireProjectWriteLock('project-lock-basic')
    const second = await acquireProjectWriteLock('project-lock-basic')

    expect(first.acquired).toBe(true)
    expect(second.acquired).toBe(true)
    expect(first.lock.expiresAt - first.lock.acquiredAt).toBe(
      PROJECT_WRITE_LOCK_TTL_MS
    )

    await releaseProjectWriteLock('project-lock-basic')

    const lock = await loadKumikoUiValue<ProjectWriteLockRecord>(
      'project-lock-basic',
      'projectWriteLock'
    )
    expect(lock).toBeNull()
  })

  it('blocks a live lock owned by another tab and takes over expired locks', async () => {
    await saveKumikoUiValue<ProjectWriteLockRecord>(
      'project-lock-owned',
      'projectWriteLock',
      {
        ownerId: 'other-owner',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }
    )

    const blocked = await acquireProjectWriteLock('project-lock-owned')
    expect(blocked.acquired).toBe(false)
    expect(blocked.lock.ownerId).toBe('other-owner')

    await saveKumikoUiValue<ProjectWriteLockRecord>(
      'project-lock-expired',
      'projectWriteLock',
      {
        ownerId: 'other-owner',
        acquiredAt: Date.now() - 120_000,
        expiresAt: Date.now() - 1,
      }
    )

    const acquired = await acquireProjectWriteLock('project-lock-expired')
    expect(acquired.acquired).toBe(true)
    expect(acquired.lock.ownerId).not.toBe('other-owner')
  })

  it('renews the current owner lock without taking over another live owner', async () => {
    const acquired = await acquireProjectWriteLock('project-lock-renew')
    const before = acquired.lock.expiresAt

    const renewed = await renewProjectWriteLock('project-lock-renew')
    const lock = await loadKumikoUiValue<ProjectWriteLockRecord>(
      'project-lock-renew',
      'projectWriteLock'
    )

    expect(renewed).toBe(true)
    expect(lock?.expiresAt).toBeGreaterThanOrEqual(before)

    await saveKumikoUiValue<ProjectWriteLockRecord>(
      'project-lock-renew-blocked',
      'projectWriteLock',
      {
        ownerId: 'other-owner',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      }
    )

    await expect(
      renewProjectWriteLock('project-lock-renew-blocked')
    ).resolves.toBe(false)
  })
})
