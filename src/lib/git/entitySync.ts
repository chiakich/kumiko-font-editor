import { entityKey, type EntityId } from '@/lib/fontFormats/formatAdapter/types'

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
  // Blob OID at the merge base, or null when the base lacked this path. Blob
  // OIDs are content hashes, so equality here is content equality — no file
  // body needs to be read to classify a path.
  baseOid: string | null
  localOid: string | null
  remoteOid: string | null
}

export interface EntitySyncInput {
  entity: EntityId
  path: string
  baseOid: string | null
  localOid: string | null
  remoteOid: string | null
  // Defaults to 'atomic'. See FormatAdapter.mergePolicy.
  mergePolicy?: 'atomic' | 'setMerge'
}

// Classic three-way comparison against the merge base, over blob OIDs. Because
// the base is a commit rather than a stored per-file hash, "unknown baseline" no
// longer exists: either the base has the path or it genuinely did not.
export const resolveEntityStatus = (input: {
  baseOid: string | null
  localOid: string | null
  remoteOid: string | null
  mergePolicy?: 'atomic' | 'setMerge'
}): EntitySyncStatus => {
  const { baseOid, localOid, remoteOid } = input
  const localChanged = localOid !== baseOid
  const remoteChanged = remoteOid !== baseOid

  if (!localChanged && !remoteChanged) {
    return 'unchanged'
  }
  if (localChanged && !remoteChanged) {
    return localOid === null ? 'localDeleted' : 'localModified'
  }
  if (!localChanged && remoteChanged) {
    // A derived file moving on its own carries no information the glyph
    // entities do not already carry, so it must not prompt a pull.
    if (input.mergePolicy === 'setMerge') {
      return 'unchanged'
    }
    if (remoteOid === null) {
      return 'remoteDeleted'
    }
    return baseOid === null ? 'remoteAdded' : 'remoteModified'
  }
  // Both sides moved. Identical content is not a conflict — it is convergence.
  if (localOid === remoteOid) {
    return 'unchanged'
  }
  // Derived bookkeeping settles itself: the local projection already reflects
  // whatever glyph set survives, so surfacing it would be a false conflict.
  if (input.mergePolicy === 'setMerge') {
    return 'localModified'
  }
  return 'conflict'
}

export const buildEntitySyncEntries = (
  inputs: readonly EntitySyncInput[]
): EntitySyncEntry[] =>
  inputs.map((input) => ({
    entity: input.entity,
    path: input.path,
    baseOid: input.baseOid,
    localOid: input.localOid,
    remoteOid: input.remoteOid,
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
