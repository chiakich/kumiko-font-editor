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

export interface FormatAdapter {
  readonly id: 'ufo' | 'glyphspackage'

  // Which entity owns this repo path, or null when the path is not part of the
  // source tree (editor scratch files, unrelated repo content).
  entityOwning(path: string): EntityId | null

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
}
