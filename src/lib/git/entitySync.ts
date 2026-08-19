import {
  entityKey,
  type EntityId,
} from 'src/lib/fontFormats/formatAdapter/types'

export type EntitySyncStatus =
  | 'unchanged'
  | 'localModified'
  | 'localDeleted'
  | 'remoteModified'
  | 'remoteAdded'
  | 'remoteDeleted'
  | 'conflict'

export interface EntitySyncEntry {
  entity: EntityId
  path: string
  status: EntitySyncStatus
  // Content at the merge base, or null when the base did not have this path.
  baseText: string | null
  localText: string | null
  remoteText: string | null
}

export interface EntitySyncInput {
  entity: EntityId
  path: string
  baseText: string | null
  localText: string | null
  remoteText: string | null
}

// Classic three-way comparison against the merge base. Because the base is a
// commit rather than a stored per-file hash, "unknown baseline" no longer
// exists: either the base has the path or it genuinely did not.
export const resolveEntityStatus = (input: {
  baseText: string | null
  localText: string | null
  remoteText: string | null
}): EntitySyncStatus => {
  const { baseText, localText, remoteText } = input
  const localChanged = localText !== baseText
  const remoteChanged = remoteText !== baseText

  if (!localChanged && !remoteChanged) {
    return 'unchanged'
  }
  if (localChanged && !remoteChanged) {
    return localText === null ? 'localDeleted' : 'localModified'
  }
  if (!localChanged && remoteChanged) {
    if (remoteText === null) {
      return 'remoteDeleted'
    }
    return baseText === null ? 'remoteAdded' : 'remoteModified'
  }
  // Both sides moved. Identical content is not a conflict — it is convergence.
  if (localText === remoteText) {
    return 'unchanged'
  }
  return 'conflict'
}

export const buildEntitySyncEntries = (
  inputs: readonly EntitySyncInput[]
): EntitySyncEntry[] =>
  inputs.map((input) => ({
    entity: input.entity,
    path: input.path,
    baseText: input.baseText,
    localText: input.localText,
    remoteText: input.remoteText,
    status: resolveEntityStatus(input),
  }))

export interface EntitySyncReport {
  entries: EntitySyncEntry[]
  conflicts: EntitySyncEntry[]
  remoteChanges: EntitySyncEntry[]
  localChanges: EntitySyncEntry[]
  isUpToDate: boolean
}

const REMOTE_STATUSES = new Set<EntitySyncStatus>([
  'remoteModified',
  'remoteAdded',
  'remoteDeleted',
])
const LOCAL_STATUSES = new Set<EntitySyncStatus>([
  'localModified',
  'localDeleted',
])

export const summarizeEntitySync = (
  entries: readonly EntitySyncEntry[]
): EntitySyncReport => {
  const conflicts = entries.filter((entry) => entry.status === 'conflict')
  const remoteChanges = entries.filter((entry) =>
    REMOTE_STATUSES.has(entry.status)
  )
  const localChanges = entries.filter((entry) =>
    LOCAL_STATUSES.has(entry.status)
  )

  return {
    entries: [...entries],
    conflicts,
    remoteChanges,
    localChanges,
    isUpToDate: conflicts.length === 0 && remoteChanges.length === 0,
  }
}

// Groups paths by entity so a glyph split across masters is decided once, not
// once per file. An entity conflicts if any of its paths conflict.
export const groupEntriesByEntity = (
  entries: readonly EntitySyncEntry[]
): Array<{ entity: EntityId; key: string; entries: EntitySyncEntry[] }> => {
  const byKey = new Map<
    string,
    { entity: EntityId; key: string; entries: EntitySyncEntry[] }
  >()
  for (const entry of entries) {
    const key = entityKey(entry.entity)
    const group = byKey.get(key)
    if (group) {
      group.entries.push(entry)
      continue
    }
    byKey.set(key, { entity: entry.entity, key, entries: [entry] })
  }
  return [...byKey.values()]
}

export const entityGroupStatus = (
  entries: readonly EntitySyncEntry[]
): EntitySyncStatus => {
  if (entries.some((entry) => entry.status === 'conflict')) {
    return 'conflict'
  }
  const changed = entries.find((entry) => entry.status !== 'unchanged')
  return changed?.status ?? 'unchanged'
}
