# Kumiko Project Persistence

## Goal

Kumiko stores every imported font as one canonical project format, independent
of the original source:

- `.glyphs`, `.glyphspackage`, UFO/designspace, and binary imports all become
  Kumiko project metadata plus per-glyph Kumiko records.
- IndexedDB never stores raw source font files for round-trip.
- `projects.fontData` is a runtime cache at most; it is not the long-term source
  of truth for glyph vectors.
- Exporters rebuild target formats from the canonical Kumiko records.

This is especially important for CJK projects where tens of thousands of glyphs
make duplicated outline storage unacceptable.

## Storage Layout

Use three format-independent stores:

| Store             | Key                    | Purpose                                                                                  |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `kumiko_projects` | `projectId`            | Project metadata, font-level data, source hints, and timestamps.                         |
| `kumiko_glyphs`   | `[projectId, glyphId]` | One canonical glyph record containing all layers for that glyph.                         |
| `kumiko_ui_state` | `[projectId, key]`     | Editor UI state, selected glyph/layer, and non-font user state. The persistence queue is runtime-only and is not stored here. |

Recommended `kumiko_glyphs` indexes:

- `byProject`: `projectId`
- `byProjectExportDirty`: `[projectId, exportDirty]`
- `byProjectSyncDirty`: `[projectId, syncDirty]`
- `byProjectDeleted`: `[projectId, deleted]`
- `byUnicode`: `unicodes`, `multiEntry: true`
- `byDisplayName`: `[projectId, displayName]`

Dirty and deletion flags are stored as a single `0 | 1` numeric field
(`exportDirty`, `syncDirty`, `deleted`) rather than a boolean plus a mirrored
index field. IndexedDB cannot index booleans, so the numeric value is both the
stored flag and the index key; helpers derive a boolean at read time. `deleted`
also doubles as the discriminated-union tag separating live records (`0`) from
tombstones (`1`).

`byDisplayName` only indexes records whose `displayName` is set; glyphs without
one are absent from that index. Lookup by canonical name uses the
`[projectId, glyphId]` primary key instead.

## Project Record

`KumikoProjectRecord` should be compact and font-wide:

```ts
interface KumikoProjectRecord {
  schemaVersion: 1
  projectId: string
  title: string
  createdAt: number
  updatedAt: number
  sourceName?: string | null
  sourceType?: 'local' | 'github'
  sourceFormat?:
    | 'glyphs'
    | 'glyphspackage'
    | 'ufo'
    | 'designspace'
    | 'ttf'
    | 'otf'
    | 'woff'
    | 'woff2'
    | null
  githubSource?: GitHubProjectSource | null

  fontInfo?: FontInfo
  unitsPerEm?: number
  axes?: FontAxes
  sources?: Record<string, FontSource>
  exportInstances?: FontExportInstance[]
  features?: OpenTypeFeatures
  openTypeFeatures?: OpenTypeFeaturesState
  kerningGroups?: KerningGroup[]
  kerningPairs?: KerningPair[]
  statusDefinitions?: DevelopmentStatusDefinition[]
  settings?: FontProjectSettings
  lineMetricsHorizontalLayout?: FontData['lineMetricsHorizontalLayout']
  glyphOrder: string[]
  exportDirty: 0 | 1
  syncDirty: 0 | 1

  sourceData?: KumikoProjectSourceData
}
```

`sourceData` is for non-vector source metadata that has no canonical Kumiko
field yet. It may contain original names, ids, ordering, custom parameters, UFO
layer directory names, Glyphs package names, or Git sync hashes. It must not
contain raw `.glyphs`, `.glif`, `paths`, `shapes`, `contours`, or components as
a second copy of geometry.

`glyphOrder` lives in the project record and is rewritten whenever glyphs are
added, renamed, deleted, or reordered. At CJK scale this is the one remaining
large array write in an otherwise per-glyph store. It is acceptable (a few
hundred KB) but is the first thing to revisit if project-record writes become
hot in profiling.

```ts
interface KumikoProjectSourceData {
  glyphs?: {
    formatVersion?: 2 | 3
    packageName?: string | null
    documentFields?: Record<string, unknown>
    fontMasterFields?: Record<string, Record<string, unknown>>
  }
  ufo?: {
    designspace?: Designspace | null
    ufos?: Array<{
      ufoId: string
      relativePath: string
      defaultLayerId: string
      layers: Array<{ layerId: string; glyphDir: string }>
      contents: Record<string, string>
      glyphOrder: string[]
      metainfo?: Record<string, unknown> | null
      fontinfoExtra?: Record<string, unknown> | null
      libExtra?: Record<string, unknown> | null
      groupsExtra?: Record<string, unknown> | null
      kerningExtra?: Record<string, unknown> | null
    }>
    lastSync?: GitHubSyncTarget | null
  }
  binary?: {
    format: 'ttf' | 'otf' | 'woff' | 'woff2'
  }
}
```

## Glyph Record

`KumikoGlyphRecord` should preserve every editable glyph datum in Kumiko-native
shape. It stores one glyph and all of its master/backup/background layers.

`glyphId` is the stable canonical glyph name. It is the key used by
`glyphOrder`, components, UFO `contents.plist`, and Glyphs `glyphname` export.
It must not be replaced by a CJK character label or any UI-only display string.
`displayName` is an optional user override only: it is `null` after import, and
the UI derives the display character from `unicodes`. No exporter reads it. See
[Canonical Model Ownership](#canonical-model-ownership).

```ts
interface KumikoGlyphRecord {
  schemaVersion: 1
  projectId: string
  glyphId: string
  displayName?: string | null
  unicodes: string[]
  production?: string | null
  export?: boolean
  category?: string | null
  subCategory?: string | null
  color?: string | number | null
  note?: string | null
  leftMetricsKey?: string | null
  rightMetricsKey?: string | null
  widthMetricsKey?: string | null
  activeLayerId?: string | null
  layerOrder: string[]
  layers: Record<string, KumikoGlyphLayerRecord>
  customData?: Record<string, unknown>
  sourceData?: KumikoGlyphSourceData
  deleted: 0
  exportDirty: 0 | 1
  syncDirty: 0 | 1
  updatedAt: number
}
```

`unicodes` is an array even though the editor UI often shows one codepoint; UFO
and Glyphs can both carry multiple unicode values. Each entry is normalized to
uppercase hex, zero-padded to at least four digits, with no `U+` prefix
(`0041`, `4E00`, `1F600`). All importers share one normalization helper so the
`byUnicode` index and cross-format lookups stay consistent.

Deleted glyphs should remain as tombstones until export/sync has reconciled the
deletion. Otherwise autosave would remove the record and later code would not
know which UFO GLIF file, Glyphs package glyph file, or remote blob should be
deleted.

```ts
interface KumikoGlyphTombstoneRecord {
  schemaVersion: 1
  projectId: string
  glyphId: string
  displayName?: string | null
  unicodes: string[]
  sourceData?: KumikoGlyphSourceData
  deleted: 1
  deletedAt: number
  exportDirty: 0 | 1
  syncDirty: 0 | 1
  updatedAt: number
}
```

Tombstone retention depends on whether the project has an external target:

- If the project has no export target and no Git/source sync target, glyph
  deletion is a hard delete with no tombstone — there is nothing to reconcile.
- If the project has an export or sync target, deletion writes a tombstone that
  survives until that target is reconciled (the external `.glif` / Glyphs glyph
  file / remote blob has been removed), after which the tombstone is purged.

## Layer Record

`KumikoGlyphLayerRecord` extends the existing `GlyphLayerData` concept with
metadata slots needed for lossless import/export:

```ts
interface KumikoGlyphLayerRecord {
  id: string
  name: string
  type: 'master' | 'backup' | 'background'
  associatedMasterId?: string | null
  paths: PathData[]
  componentRefs: GlyphComponentRef[]
  anchors: GlyphAnchor[]
  guidelines: GlyphGuideline[]
  metrics: GlyphMetrics
  verticalMetrics?: {
    height?: number | null
    tsb?: number | null
    bsb?: number | null
  }
  color?: string | number | null
  visible?: boolean
  locked?: boolean
  background?: KumikoGlyphLayerContent | null
  image?: KumikoGlyphImage | null
  customData?: Record<string, unknown>
  sourceData?: KumikoLayerSourceData
}
```

Background layers and layer images are canonical fields, not source blobs.
Glyphs background layers map onto the `background` content (or a layer whose
`type` is `background`), and both Glyphs and UFO images map onto `image`. They
must not be stored as opaque entries under `sourceData`.

The existing path/node/component/anchor/guideline records should also allow
`name`, `identifier`, `color`, and `customData` where the source format supports
them. Those fields are metadata on the canonical element, not a duplicate raw
source contour.

## Source Data Boundaries

Source-specific data is allowed only when it is:

- non-vector metadata,
- required to export a source format faithfully,
- or required for Git/source synchronization.

Examples that belong in source data:

- Glyphs custom parameters, classes, feature prefixes, unknown font/glyph/layer
  scalar fields, package name, and format version.
- UFO `metainfo.plist`, extra `fontinfo.plist` keys, extra `lib.plist` keys,
  layer directory names, `contents.plist` file names, GLIF image records, note,
  point identifiers, colors, source hashes, and remote blob SHAs.
- Binary source format hint.
- Tombstone source hints needed to delete an external glyph file or remote blob
  after the live glyph record has been deleted.

Examples that must not be stored in source data:

- Raw `.glyphs` text.
- Raw `.glif` XML.
- Raw Glyphs `paths`, `components`, `shapes`, or node arrays.
- Raw UFO `contour`, `point`, or `component` arrays.
- A complete `FontData` copy inside the project record.

If a source format has a vector-like feature that Kumiko does not model yet,
add it to the canonical model first. For example, Glyphs background layers and
UFO images should become canonical layer/background/image fields rather than an
opaque raw source blob.

## Canonical Model Ownership

Kumiko uses option B: `FontData` is the canonical glyph model, not a lossy
runtime projection of it. The editor's runtime types carry every field needed
for lossless import/export. `KumikoGlyphRecord` is a per-glyph slice of that
same data plus storage metadata (dirty/sync/deleted flags, timestamps).

Consequences:

- The element types in `src/store/types.ts` are extended to hold all lossless
  fields. `GlyphData` gains `unicodes: string[]`, `note`, the metrics keys,
  `color`, `customData`, and `sourceData`. `GlyphLayerData` gains
  `verticalMetrics`, `background`, `image`, `color`, `visible`, `locked`, and
  `sourceData`. Path, component, anchor, and guideline records gain
  `identifier`, `color`, `customData`, and `sourceData`.
- `kumikoFontDataAdapter` is a lossless structural transform: slice a glyph out
  of `FontData`, or merge records back into `FontData`. Because both shapes hold
  the same field set, a `FontData → record → FontData` round trip never drops
  data, and there is no read-modify-write merge of "fields FontData cannot
  model" — it models all of them.
- Runtime types are larger than canvas code strictly needs. That is the accepted
  cost of option B: canvas/editor code ignores fields it does not use, rather
  than the model losing them.

### Glyph Identity and the Three Names

A glyph carries three distinct names; they must not be collapsed:

| Name                  | Field         | Role                                                                                       | Persisted        |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| glyphname (nice name) | `glyphId`     | Portable identity. Keys `glyphOrder`, component refs, UFO `contents.plist`, Glyphs glyphname. | Yes (record key) |
| production name       | `production`  | PostScript name for the binary `post` table only.                                          | Yes, optional    |
| display character     | —             | UI label such as `←`, derived from `unicodes` at render time.                              | No               |

Rules:

- `glyphId` is the glyphname and the canonical identity. Kumiko does not use a
  separate internal surrogate id. Font formats and GitHub sync already treat the
  glyphname as the shared identity (component refs and `.glif` filenames use it),
  so a local surrogate would only add an indirection layer that breaks down
  across collaborators.
- Exporters always write `glyphId` as the target glyphname and never write
  `displayName`. The previous bug was Glyphs export writing the computed display
  character as the glyphname, producing invalid names like `←` on a UFO→Glyphs
  round trip.
- `displayName` is a pure optional user override. It is `null` after import; the
  UI derives the display character from `unicodes`. Because no exporter reads it,
  display-name divergence can never corrupt export output.

### Rename

Renaming a glyph changes its glyphname, which is the record key, so it reuses the
tombstone machinery instead of being a special case:

1. Write a tombstone for the old `glyphId` so the old `.glif` / Glyphs glyph
   file / remote blob is removed on the next export or sync.
2. Write a new record under the new `glyphId`.
3. Update every reference to the old name: `componentRefs.glyphId`,
   `glyphOrder`, kerning pairs/groups, and metric keys.

Rename is rare and bounded. Git detects the delete+add as a rename by content
similarity, so source-format history stays clean.

## Import Pipeline

Every importer should follow the same pipeline:

1. Parse the source format into adapter-native temporary data.
2. Convert project-level data into `KumikoProjectRecord`.
3. Convert every glyph into `KumikoGlyphRecord`.
4. Save project metadata once and glyph records in batches.
5. Build runtime `FontData` from the canonical records for the editor.

Format adapters own the lossy/lossless mapping details; persistence never needs
to know whether a glyph came from Glyphs, UFO, or a binary font.

## Export Pipeline

Every exporter should read canonical records:

1. Load `KumikoProjectRecord`.
2. Load the required `KumikoGlyphRecord`s, either all glyphs or a filtered set.
3. Build target format records from Kumiko data plus source metadata.
4. Emit fresh `.glyphs`, `.glyphspackage`, UFO/designspace, or binary output.

This means path order or textual formatting may differ from the original source,
but outlines, components, metrics, anchors, guidelines, features, masters, and
format metadata should remain semantically equivalent.

## Runtime State vs IndexedDB

IndexedDB is the local source of truth. Zustand `FontData` is the editor runtime
view assembled from that source of truth.

| Concern       | IndexedDB canonical records                                      | In-memory Zustand state                                                               |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Ownership     | Durable local project source of truth.                           | Active editing session and UI responsiveness.                                         |
| Shape         | `KumikoProjectRecord` plus per-glyph `KumikoGlyphRecord`s.       | `FontData` plus selection, viewport, search, editor-line, and transient UI state.     |
| Granularity   | Project metadata and one record per glyph.                       | One convenient object graph for canvas/editor operations.                             |
| Writes        | Debounced/batched background writes, ideally worker-driven.      | Immediate synchronous mutations for interaction latency and undo/redo.                |
| Size strategy | No duplicated vectors; glyph records are independently writable. | May hold loaded glyphs for the active session, but should not be persisted wholesale. |
| Undo/redo     | Not stored as font data history.                                 | Zundo tracks runtime `fontData` changes for the session.                              |

The two are the same canonical data at different granularities, not two
different models. `FontData` is one object graph shaped for the editor: canvas
tools, overview filtering, component lookup, feature validation, and export code
read it without IndexedDB round trips. `KumikoProjectRecord` and
`KumikoGlyphRecord` are the same fields sliced for storage: compact project
metadata, independent per-glyph writes, per-glyph dirty/sync flags, and lazy
loading for CJK scale.

The bridge between the two granularities is `kumikoFontDataAdapter`. Because both
hold the same field set (option B), these are lossless structural transforms,
not lossy projections:

- `fontDataToKumikoProjectRecord(...)`
- `fontDataToKumikoGlyphRecords(...)`
- `kumikoRecordsToFontData(...)`

As the persistence migration progresses, direct long-term writes of
`projects.fontData` should disappear. The old `projects` draft store may remain
temporarily as a compatibility shell while the app is still being refactored,
but it must not remain the authoritative glyph-vector store.

## Autosave and Dirty Semantics

Once canonical per-glyph IndexedDB storage is in place, manual "save draft" is
not the primary persistence model. Edits should autosave locally:

1. A user action mutates runtime Zustand state immediately.
2. The action enqueues affected project/glyph ids for persistence.
3. A debounce window coalesces rapid edits.
4. A background task writes changed `KumikoProjectRecord` /
   `KumikoGlyphRecord`s to IndexedDB.
5. The UI reports `saving`, `saved`, or `save-error` local persistence state.
6. Closing a project or tab flushes pending writes immediately when possible.

The current store fields mix several concepts:

- `isDirty` currently means "draft needs manual save".
- `dirtyGlyphIds` / `deletedGlyphIds` currently feed draft save.
- `hasLocalChanges`, `localDirtyGlyphIds`, and `localDeletedGlyphIds` currently
  also drive export/GitHub sync flows.

In the target model, split those meanings:

| Target concept       | Lifetime                   | Meaning                                                                    |
| -------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `pendingPersistence` | Runtime only               | Changes exist in memory but have not flushed to IndexedDB yet.             |
| `persistenceStatus`  | Runtime/UI                 | `idle`, `queued`, `saving`, `saved`, or `error`.                           |
| `exportDirty`        | Persisted/indexed          | Canonical local project/glyph differs from the last exported target state. |
| `syncDirty`          | Persisted/indexed          | Canonical local project/glyph differs from the last Git/source sync point. |
| `deleted`            | Persisted until reconciled | Canonical tombstones needed for export/sync deletion.                      |

Initial flag state after import depends on the source:

| Import source                        | `exportDirty` | `syncDirty`              |
| ------------------------------------ | ------------- | ----------------------- |
| Local file (`.glyphs`, UFO, binary)  | `0`           | `0` (no sync target)    |
| GitHub                               | `0`           | `0` (matches the commit) |

A freshly imported project equals the source it came from, so nothing is dirty
until the user edits. `exportDirty` is `0` after import because the records match
their source; the first export is a full export regardless of flags, and
`exportDirty` only gates incremental exports afterward. Local-file projects have
no sync target, so `syncDirty` stays `0` and becomes meaningful only once a sync
target is attached.

The important distinction: "saved locally" and "synced/exported externally" are
not the same state. After autosave succeeds, a glyph should no longer be
pending local persistence, but it may still be dirty relative to UFO/Glyphs
export or GitHub sync. The same applies to project-level data such as font info,
axes, sources, features, kerning, settings, and glyph order; those changes set
`KumikoProjectRecord.exportDirty` / `syncDirty` rather than a glyph dirty flag.

Recommended UI wording follows that split:

- `Saving...` / `Saved locally` / `Local save failed` for IndexedDB
  persistence.
- `Has export changes` for changes not yet written to a target font format.
- `Has GitHub changes` for changes not yet committed or pushed.

This lets the editor remove or de-emphasize a manual "save draft" button while
keeping explicit user actions for export, commit, push, and PR creation.

## Background Persistence Queue

The autosave layer should not save the entire font after every edit. It should
operate on queues:

```ts
interface PersistenceQueueState {
  projectQueued: boolean
  glyphIds: Set<string>
  deletedGlyphIds: Set<string>
  status: 'idle' | 'queued' | 'saving' | 'saved' | 'error'
  lastError?: string | null
}
```

Glyph-editing actions enqueue only affected glyph ids. Font-level actions such
as editing family info, axes, sources, features, kerning, settings, or glyph
order enqueue the project record. Operations that add, rename, or delete glyphs
enqueue both project metadata and the affected glyph/tombstone records.

The queue can start on the main thread using `requestIdleCallback` or a short
debounce. If serialization or IndexedDB writes become visible in profiling, move
record conversion and writes to a worker. The worker boundary should exchange
canonical records, not raw source format records.

Flush rules:

- Flush before closing a project.
- Flush before export or GitHub commit so external output uses the latest local
  canonical records.
- Flush immediately for destructive operations such as glyph deletion.
- Keep failed records in the queue and surface retry UI.

## Migration Plan

The project has not shipped yet, so no old draft compatibility is required.

1. Add the new `kumiko_projects`, `kumiko_glyphs`, and `kumiko_ui_state` stores.
2. Extract the current UFO per-glyph persistence helpers into generic Kumiko
   project/glyph persistence helpers.
3. Convert UFO import to write `KumikoGlyphRecord` instead of `UfoGlyphRecord`.
4. Convert Glyphs import to write the same records.
5. Convert binary import to write the same records and drop stored `binarySource`
   buffers from long-term project state unless explicitly needed for debugging.
6. Change project load/save so `projects.fontData` no longer stores full glyph
   vectors.
7. Replace manual draft save with debounced local autosave into canonical
   records.
8. Keep `FontData` as the editor runtime view assembled from canonical records.
