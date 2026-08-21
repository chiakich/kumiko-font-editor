// The unit of ownership, conflict and merge across every source format. Formats
// differ in how entities map onto files — one file per glyph, one file per
// master, or a single file for the whole font — so paths are an adapter detail
// and entities are the shared currency.
export type EntityId =
  | {
      kind: 'font'
      part: 'info' | 'features' | 'kerning' | 'order' | 'designspace'
    }
  | { kind: 'glyph'; name: string }

export const entityKey = (entity: EntityId): string =>
  entity.kind === 'glyph' ? `glyph:${entity.name}` : `font:${entity.part}`

export const entitiesEqual = (left: EntityId, right: EntityId): boolean =>
  entityKey(left) === entityKey(right)

export type SourceFormatId = 'ufo' | 'glyphspackage'

export interface MaterializedFile {
  // Repo-relative path, identical to what the source tree holds on disk.
  path: string
  text: string
  entity: EntityId
  // Mirrors the manifest's glyph accounting so callers can drive a progress bar
  // without re-deriving which writes are user-visible work.
  countsTowardTotal: boolean
}

export type MaterializeScope = 'all' | 'dirty'

export interface MaterializeOptions {
  projectId: string
  scope?: MaterializeScope
  onTotal?: (totalGlyphs: number) => void
}

// Recognises a source tree from its file listing alone, so import can pick a
// format before anything is parsed.
export interface FormatDetection {
  id: SourceFormatId
  // Root of the detected tree, relative to the repo (e.g. 'Family.glyphspackage'
  // or '' when .ufo folders sit at the top level).
  root: string
  // Human-facing label for a picker when a repo holds more than one format.
  label: string
}

export interface FormatAdapter {
  readonly id: SourceFormatId

  // Which entity owns this repo path, or null when the path is not part of the
  // source tree (editor scratch files, unrelated repo content). Deliberately
  // answers for paths only the remote has, so a sync report can attribute them
  // to an entity — which is why it must never be read as permission to delete.
  entityOwning(path: string): EntityId | null

  // Whether the project may delete this path from the repository. True only for
  // paths the project's own records account for: a file it currently writes, or
  // one its last-synced bookkeeping named. A path that merely looks like ours —
  // a .glif some other contributor added under a glyph directory — is content
  // we do not know about, and dropping it silently loses their work.
  canRemovePath(path: string): boolean

  // Every repo path this entity writes. More than one for formats that split an
  // entity across masters; the same path for several entities in single-file
  // formats.
  pathsOwnedBy(entity: EntityId): string[]

  // Paths that belong to the format but must never be tracked.
  readonly ignoredPaths: readonly string[]

  // How a both-sides-changed entity is settled.
  //
  // - `atomic`: the entity is real content; a divergence is a genuine conflict
  //   and a person has to choose.
  // - `setMerge`: the entity is derived bookkeeping (a glyph listing, an order
  //   file). Its content follows from the entities around it, so a divergence
  //   resolves itself once those are applied and must never be shown as a
  //   conflict — that is exactly the case of two contributors each adding a
  //   different glyph.
  mergePolicy(entity: EntityId): 'atomic' | 'setMerge'

  // The single projection from canonical records to source files. Streamed so a
  // CJK-scale project never has to be held in memory at once.
  materialize(options: MaterializeOptions): AsyncGenerator<MaterializedFile>

  // Every path the project would write, without loading glyph geometry. Used to
  // spot files that must be deleted when only part of a tree is rebuilt.
  listPaths(projectId: string): Promise<string[]>
}

// Formats declare themselves here so import and sync can enumerate what Kumiko
// understands without importing every implementation.
export type FormatDetector = (paths: readonly string[]) => FormatDetection[]
