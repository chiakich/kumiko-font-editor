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

| Store             | Key                    | Purpose                                                                                                                       |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `kumiko_projects` | `projectId`            | Project metadata, font-level data, source hints, and timestamps.                                                              |
| `kumiko_glyphs`   | `[projectId, glyphId]` | One canonical glyph record containing all layers for that glyph.                                                              |
| `kumiko_ui_state` | `[projectId, key]`     | Editor UI state, selected glyph/layer, and non-font user state. The persistence queue is runtime-only and is not stored here. |

Recommended `kumiko_glyphs` indexes:

- `byProject`: `projectId`
- `byProjectExportDirty`: `[projectId, exportDirty]`
- `byProjectSyncDirty`: `[projectId, syncDirty]`
- `byUnicodeKey`: `unicodeKeys`, `multiEntry: true`
- `byDisplayName`: `[projectId, displayName]`
- `byComponentRefKey`: `componentRefKeys`, `multiEntry: true`

Dirty flags are stored as a single `0 | 1` numeric field (`exportDirty`,
`syncDirty`) rather than a boolean plus a mirrored index field. IndexedDB cannot
index booleans, so the numeric value is both the stored flag and the index key;
callers can treat `1` as true and `0` as false.

`byDisplayName` only indexes records whose `displayName` is set; glyphs without
one are absent from that index. Lookup by canonical name uses the
`[projectId, glyphId]` primary key instead.

`byUnicodeKey` and `byComponentRefKey` are project-scoped multi-entry indexes.
IndexedDB compound indexes cannot directly combine `projectId` with each item of
an array key path, so the record carries derived key arrays:

```ts
unicodeKeys = unicodes.map((unicode) => projectId + '\0' + unicode)
componentRefKeys = componentGlyphIds.map(
  (glyphId) => projectId + '\0' + glyphId
)
```

This avoids cross-project scans when the user has multiple CJK-scale projects in
one local database.

`componentGlyphIds` is a denormalized array on each glyph record (the
de-duplicated union of `glyphId`s referenced by component refs across all
layers), maintained on every write. `byComponentRefKey` answers "which glyphs in
this project reference component X" in one indexed lookup — needed for rename
propagation and for resolving components when only part of the font is loaded.
IndexedDB cannot index across the dynamic keys of `layers`, so flat derived
fields are required rather than deep key paths.

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
  exportedDigest?: string | null
  syncedDigest?: string | null

  sourceData?: KumikoProjectSourceData
}
```

`sourceData` is for non-vector source metadata that has no canonical Kumiko
field yet. It may contain original names, ids, ordering, custom parameters, UFO
layer directory names, Glyphs package names, or Git sync hashes. It must not
contain raw `.glyphs`, `.glif`, `paths`, `shapes`, `contours`, or components as
a second copy of geometry.

`glyphOrder` lives in the project record and is rewritten whenever glyphs are
added, renamed, deleted, or reordered.

```ts
interface KumikoProjectSourceData {
  glyphs?: {
    formatVersion?: 2 | 3
    packageName?: string | null
    repoPath?: string | null
    documentFields?: Record<string, unknown>
    fontMasterFields?: Record<string, Record<string, unknown>>
  }
  ufo?: {
    designspace?: Designspace | null
    designspacePath?: string | null
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
    repoPath?: string | null
  }
}
```

All path fields are repo-root-relative POSIX paths, stored so a GitHub commit can
write each artifact back to the exact location it was imported from: `repoPath`
is the `.glyphs` file / `.glyphspackage` directory / binary file, `designspacePath`
is the `.designspace` file (null for a bare UFO with no designspace), and each
`ufos[].relativePath` is the `.ufo` directory. They carry no geometry, so they
belong in `sourceData`; the repo coordinates themselves (owner, repo, branch,
commit) stay in the project-level `githubSource`.

## Glyph Record

`KumikoGlyphRecord` should preserve every editable glyph datum in Kumiko-native
shape. It stores one glyph and all of its layers (master, backup, brace,
bracket), each layer carrying its own optional background content.

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
  status?: number | null
  color?: KumikoColor | null
  note?: string | null
  leftMetricsKey?: string | null
  rightMetricsKey?: string | null
  widthMetricsKey?: string | null
  layerOrder: string[]
  layers: Record<string, KumikoGlyphLayerRecord>
  componentGlyphIds: string[]
  unicodeKeys: string[]
  componentRefKeys: string[]
  customData?: Record<string, unknown>
  sourceData?: KumikoGlyphSourceData
  exportDirty: 0 | 1
  syncDirty: 0 | 1
  exportedDigest?: string | null
  syncedDigest?: string | null
  updatedAt: number
}
```

`componentGlyphIds`, `unicodeKeys`, and `componentRefKeys` are derived, not
authored. `componentGlyphIds` is the de-duplicated union of every
`componentRefs[].glyphId` across all layers, recomputed on each write.
`unicodeKeys` and `componentRefKeys` are storage-index fields only and are
recomputed from `projectId`, `unicodes`, and `componentGlyphIds`.

`exportedDigest` / `syncedDigest` are the glyph's canonical content fingerprint
at the last export and the last Git/source sync. They are the baseline the
`exportDirty` / `syncDirty` flags compare against, so dirtiness can be recomputed
from content rather than trusting that every edit remembered to set a flag. A
glyph is export-clean when its current digest equals `exportedDigest`. The
project record carries the analogous digests for project-level metadata.

Digest scope is target-aware. For file-per-glyph targets such as UFO GLIF files
or `.glyphspackage` glyph files, a sync adapter may additionally cache the
remote blob SHA for each emitted file and use that SHA when rebuilding a git
tree. For monolithic targets such as a single `.glyphs`, `.ttf`, `.otf`, `.woff`,
or `.woff2` file, there is no per-glyph remote blob to cite: glyph-level digests
still detect local dirtiness, but the adapter must rebuild the whole target file
when any relevant project or glyph digest changes. If Kumiko later supports
multiple simultaneous export targets, these baselines must become target-keyed
rather than one global `exportedDigest` / `syncedDigest` pair.

`status` is the per-glyph development-status value; it matches a
`statusDefinitions[].value` in the project record and is what the overview status
label and filtering read. It is distinct from `color` (a free label color).

`activeLayerId` is not stored here. Which layer was last active is editor state
and lives in `kumiko_ui_state`, not in the canonical glyph record.

`unicodes` is an array even though the editor UI often shows one codepoint; UFO
and Glyphs can both carry multiple unicode values. Each entry is normalized to
uppercase hex, zero-padded to at least four digits, with no `U+` prefix
(`0041`, `4E00`, `1F600`). All importers share one normalization helper so the
`byUnicodeKey` index and cross-format lookups stay consistent.

## Deletion

Glyph deletion is a hard delete: the `kumiko_glyphs` record is removed and the
project record is re-enqueued because `glyphOrder` changed. Kumiko keeps no
tombstones.

Deletion is reconciled by diffing, not by remembering. At export or sync time the
complete live glyph set is compared against the target's own current state, and
anything present in the target but absent from the live set is removed:

- One-shot "export to file" always emits a fresh full tree, so a deleted glyph is
  simply never written.
- Connected folder sync lists the target directory and removes orphaned `.glif` /
  glyph files not in the live set.
- GitHub sync rebuilds the full git tree from the live set. For file-per-glyph
  targets it cites each unchanged glyph file's cached remote blob SHA and
  re-uploads only changed blobs. For monolithic targets it rewrites the changed
  target file as a whole. A deleted glyph is omitted from the generated target
  state, which git records as a deletion where the target format has a per-glyph
  path.

This works because the target's current state — the previous git tree, or the
folder listing — is itself the record of what exists remotely; local history is
unnecessary. Two requirements follow: the sync step must enumerate that target
state (fetch the base tree, or read the directory) rather than blindly pushing a
partial update; and file-per-glyph sync must keep a separate mapping from
canonical records to remote blob SHAs so unchanged glyph files can be cited
without re-uploading or loading their geometry — so full-tree rebuild stays cheap
at CJK scale.

This is also why deletion must never be implemented as an incremental GitHub
commit that omits the glyph from a `base_tree` update: unmentioned entries are
inherited from the base tree, so the glyph would silently survive. Full-tree
rebuild from the live set is the contract.

## Layer Record

`KumikoGlyphLayerRecord` extends the existing `GlyphLayerData` concept with
metadata slots needed for lossless import/export:

```ts
interface KumikoGlyphLayerRecord {
  id: string
  name: string
  type: 'master' | 'backup' | 'brace' | 'bracket'
  associatedMasterId?: string | null
  braceLocation?: Record<string, number> | null
  bracketAxisRules?: Record<string, { min?: number; max?: number }> | null
  outlineKind: 'cubic' | 'quadratic'
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
  hints?: KumikoHint[]
  color?: KumikoColor | null
  visible?: boolean
  locked?: boolean
  background?: KumikoGlyphLayerContent | null
  image?: KumikoGlyphImage | null
  customData?: Record<string, unknown>
  sourceData?: KumikoLayerSourceData
}
```

A master layer's `id` is the master/source identity: it equals the matching
`FontSource.id` in the project record. That convention is how an exporter knows
which UFO master / Glyphs master a layer belongs to, and how `backup`, `brace`,
and background content point back to their parent via `associatedMasterId`.

`type` covers every vector-bearing layer Kumiko models: `master` (a source/master
outline), `backup` (a saved older state of a master), `brace` (an intermediate
master at `braceLocation` in design space), and `bracket` (a conditional
alternate active within `bracketAxisRules`). Glyphs brace/bracket layers carry
outlines, so they are canonical layer types, not `sourceData` blobs.

`outlineKind` is a layer-level asserted invariant over the layer's paths, not the
geometric source of truth. The authoritative curve labels live on on-curve path
nodes as `segmentType: 'line' | 'cubic' | 'quadratic'`; `outlineKind` must be
derivable from those node labels and is used to select export encoding, validate
that a layer does not mix curve models, and avoid format adapters inferring a
layer-wide mode ad hoc. If a stored `outlineKind` disagrees with the nodes, the
record is invalid and the importer/loader must repair it from nodes or reject
the glyph.

`FontProjectSettings.outlineType`, layer `outlineKind`, and node `segmentType`
have different scopes:

- `FontProjectSettings.outlineType` is the project-level default/export target
  policy: PostScript/CFF projects use `cubic`, TrueType projects use
  `quadratic`.
- `KumikoGlyphLayerRecord.outlineKind` is the validated per-layer invariant
  derived from that layer's nodes.
- `PathNode.segmentType` is the per-segment geometry source of truth.

Interpolable source layers must not vary freely. In a variable/interpolating
project, every master/source layer that participates in interpolation must match
`FontProjectSettings.outlineType`, and all master layers of the same glyph must
share the same `outlineKind`; cubic and quadratic outlines cannot interpolate
against each other. Non-interpolating layers such as backup/background may carry
a different `outlineKind`, but any export path that promotes them into
interpolable sources must normalize or reject them first.

Background and layer images are canonical fields, not source blobs. A background
is the backdrop of one specific layer, so it is the `background` content field on
that layer rather than a free-standing entry in `layerOrder`; UFO background
layers are folded into their parent layer's `background` on import and re-emitted
as a UFO background layer on export. Both Glyphs and UFO images map onto `image`.
They must not be stored as opaque entries under `sourceData`.

`hints` holds source-level structured hints (PostScript/CFF stem hints, TrueType
stem/zone hints and hint masks) where the source format carries them — editable
hint data, not compiled bytecode. The exact `KumikoHint` shape is settled during
implementation. See [Source Data Boundaries](#source-data-boundaries) for why
compiled binary hinting is deliberately not preserved.

The existing path/node/component/anchor/guideline records should also allow
`name`, `identifier`, `color`, and `customData` where the source format supports
them. Those fields are metadata on the canonical element, not a duplicate raw
source contour.

Component references must have exactly one canonical transform. A 2x3 affine
matrix has six degrees of freedom (`a`, `b`, `c`, `d`, `e`, `f`). The current
runtime shape (`x`, `y`, `scaleX`, `scaleY`, `rotation`, `xyScale`, `yxScale`) is
over-determined unless a composition rule is specified. The canonical Kumiko
record should therefore store the affine matrix as the source of truth, with any
TRS-style fields (`x`, `y`, `scaleX`, `scaleY`, `rotation`) treated as derived UI
values or adapter conveniences. If the runtime keeps the decomposed fields, it
must define a single composition order and persist only the resulting matrix.

Exporters must not drop shear silently. Glyphs 2 and UFO can express full
six-number component transforms. Glyphs 3 needs adapter verification against the
file format and saved-file behavior: the Glyphs Python API exposes both
TRS-style component fields (`position`, `scale`, `rotation`, `slant`) and a
matrix `transform`, but the documentation notes that in Glyphs 3 the transform is
computed from scale, rotation, and position. Before writing a Glyphs 3 exporter,
test whether a component matrix with shear survives a save/reopen round trip. If
it does, write the matrix-preserving representation. If it does not, surface an
explicit export warning or require a normalization/decompose choice.

Component references additionally carry an automatic-alignment flag (`autoAlign`).
Glyphs can auto-align a component to anchors and then ignore its stored offset;
UFO has no such concept and always writes explicit offsets. Kumiko keeps the flag
canonical so a Glyphs round trip preserves the behavior, and resolves it to an
explicit offset only when exporting UFO. This matters for component-based
composition, including imported fonts that lean on aligned components.

## Source Data Boundaries

Source-specific data is allowed only when it is:

- non-vector metadata,
- required to export a source format faithfully,
- or required for Git/source synchronization.

Examples that belong in source data:

- Glyphs custom parameters, classes, feature prefixes, unknown font/glyph/layer
  scalar fields, package name, and format version.
- UFO `metainfo.plist`, extra `fontinfo.plist` keys, extra `lib.plist` keys,
  layer directory names, `contents.plist` file names, source hashes, and remote
  blob SHAs.
- Binary source format hint.

Examples that must not be stored in source data:

- Raw `.glyphs` text.
- Raw `.glif` XML.
- Raw Glyphs `paths`, `components`, `shapes`, or node arrays.
- Raw UFO `contour`, `point`, or `component` arrays.
- A complete `FontData` copy inside the project record.

If a source format has a vector-like feature that Kumiko does not model yet,
add it to the canonical model first. For example, Glyphs/UFO background layers
and images should become the canonical `background` / `image` layer fields rather
than an opaque raw source blob.

The same rule applies to source metadata once Kumiko has a canonical field for
it: GLIF notes map to `note`, point identifiers map to element `identifier`
fields, colors map to `KumikoColor`, and image records map to `image`. Only
unknown scalar leftovers stay in `sourceData`.

This boundary is enforced by a test, not by convention alone: a round-trip test
walks every `sourceData` subtree and fails if it finds a geometry-bearing key
(`paths`, `nodes`, `points`, `contours`, `segments`, `components`, `shapes`).
Geometry has a canonical home; `sourceData` is non-vector metadata only.

Compiled binary tables are the one deliberate loss. Binary import is a
decompilation into editable source: outlines, anchors, kerning, and the parts of
GPOS/GSUB the feature IR can represent become canonical, but TrueType hinting
bytecode (`fpgm` / `prep` / `cvt` / glyph instructions) and any layout the IR
cannot model are not preserved as raw tables. Keeping them would re-introduce a
raw source blob, and they are invalidated the moment an outline is edited anyway;
hinting is regenerated on export. This is why `sourceData.binary` carries only a
format hint. Source-format structured hints (Glyphs/UFO) are different: they are
editable and round-trip through the canonical `hints` layer field.

Cross-source-format gaps follow the same rule. Some Glyphs-only settings —
component automatic-alignment state, the bracket trick, other layer attributes —
have no UFO representation. Their _effect_ is resolved into explicit geometry on
UFO export (aligned components become explicit offsets; bracket/brace layers
become designspace `<rules>` / intermediate sources). When a setting has a
canonical field, such as `autoAlign`, `bracketAxisRules`, or `braceLocation`, the
canonical field is the stored intent and the adapter decides how much of that
intent its target can express. Only source-only scalar leftovers with no
canonical field stay in `customData` / `sourceData`.

Implementation note (deferred): the `brace`/`bracket` ↔ UFO translation is not
1:1 with Glyphs layer attributes and must be specified against the source specs,
not this Glyphs workflow tutorial. Whoever builds the UFO adapter should define,
in both directions:

- `brace` (intermediate master at `braceLocation`) ↔ designspace **intermediate /
  sparse source** at that location. Check how a per-glyph intermediate layer maps
  onto a source that is otherwise font-wide.
- `bracket` (`bracketAxisRules`) ↔ designspace **`<rules>` / `<conditionset>`**
  substitutions. Check the substitute-glyph naming and condition ranges.
- Glyphs layer attributes (`coordinates` for brace, `axisRules` for bracket) as
  the import side of the same mapping.

References to consult: the UFO 3 `designspace` specification (`rules`,
`conditionset`, intermediate/sparse sources) and the Glyphs file-format layer
`attributes`. Until that mapping is settled, a `bracket`/`brace` layer that an
adapter cannot translate is preserved losslessly in the canonical record and
round-trips through Glyphs; only its UFO projection is incomplete.

## Canonical Model Ownership

`FontData` is the canonical glyph model, not a lossy runtime projection of it.
The editor's runtime types carry every field needed for lossless import/export,
and `KumikoGlyphRecord` is a per-glyph slice of that same data plus storage
metadata (dirty/sync flags, digests, timestamps).

Consequences:

- The element types in `src/store/types.ts` are extended to hold all lossless
  fields. `GlyphData` gains `unicodes: string[]`, `note`, the metrics keys,
  `color`, `customData`, and `sourceData`. `GlyphLayerData` gains
  `verticalMetrics`, `background`, `image`, `color`, `visible`, `locked`, and
  `sourceData`. Path, component, anchor, and guideline records gain
  `identifier`, `color`, `customData`, and `sourceData`.
- Legacy duplicate fields are removed so the model has one representation per
  concept: `GlyphData.unicode` is dropped in favor of `unicodes: string[]`, and
  `GlyphLayerData.components: string[]` is dropped in favor of `componentRefs`.
  Color stops being a `string | number` union; the canonical type is
  `KumikoColor = [number, number, number, number]` (RGBA, 0–1, matching
  `DevelopmentStatusDefinition.color`). A source-specific encoding such as a
  Glyphs label-color index is preserved in `sourceData` for faithful re-export,
  not carried in the canonical field.
- `kumikoFontDataAdapter` is a lossless structural transform: slice a glyph out
  of `FontData`, or merge records back into `FontData`. Because both shapes hold
  the same field set, a `FontData → record → FontData` round trip never drops
  data, and there is no read-modify-write merge of "fields FontData cannot
  model" — it models all of them.
- The one exception to "same field set" is the component transform: the canonical
  record stores a 2x3 affine matrix as source of truth, while runtime
  `GlyphComponentRef` may keep the decomposed TRS fields. Where that holds, the
  adapter does a real (lossless) TRS↔matrix conversion here rather than a plain
  structural slice. If the runtime later stores the matrix as its own source of
  truth, the exception disappears.

This does not mean every in-memory reference is always a complete glyph. Runtime
code must distinguish metadata-only glyph entries from loaded glyph data:

```ts
interface GlyphMetadata {
  glyphId: string
  displayName?: string | null
  unicodes: string[]
  production?: string | null
  category?: string | null
  subCategory?: string | null
  export?: boolean
  color?: KumikoColor | null
  status?: number | null
  note?: string | null
  leftMetricsKey?: string | null
  rightMetricsKey?: string | null
  widthMetricsKey?: string | null
  componentGlyphIds: string[]
}

interface LoadedGlyphData extends GlyphData {
  layers: Record<string, GlyphLayerData>
}
```

Metadata-only entries must never be serialized back as complete glyph records.
If a user edits only metadata such as color, status, note, or export flag while
the glyph's geometry tier is unloaded, the persistence layer performs a
metadata patch against the existing `KumikoGlyphRecord` or loads the full record
first. It must not write an empty `layers` object or recompute
`componentGlyphIds` from missing geometry.

### Glyph Identity and the Three Names

A glyph carries three distinct names; they must not be collapsed:

| Name                  | Field        | Role                                                                                          | Persisted        |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------- | ---------------- |
| glyphname (nice name) | `glyphId`    | Portable identity. Keys `glyphOrder`, component refs, UFO `contents.plist`, Glyphs glyphname. | Yes (record key) |
| production name       | `production` | PostScript name for the binary `post` table only.                                             | Yes, optional    |
| display character     | —            | UI label such as `←`, derived from `unicodes` at render time.                                 | No               |

Rules:

- `glyphId` is the glyphname and the canonical identity. Kumiko does not use a
  separate internal surrogate id. Font formats and GitHub sync already treat the
  glyphname as the shared identity (component refs and `.glif` filenames use it),
  so a local surrogate would only add an indirection layer that breaks down
  across collaborators.
- Exporters always write `glyphId` as the target glyphname, never `displayName`
  or the computed display character (which would emit invalid names like `←`).
- `displayName` is a pure optional user override. It is `null` after import; the
  UI derives the display character from `unicodes`. Because no exporter reads it,
  display-name divergence can never corrupt export output.

### Rename

Renaming a glyph changes its glyphname, which is the record key, so it is a
delete-plus-add rather than an in-place edit:

1. Delete the old `glyphId` record.
2. Write a new record under the new `glyphId`.
3. Update every reference to the old name: `componentRefs.glyphId`,
   `glyphOrder`, kerning pairs/groups, and metric keys.

On the next export or sync, the same diff-based reconciliation removes the old
glyphname's file/blob and adds the new one. Git detects the delete+add as a
rename by content similarity, so source-format history stays clean.

## Import Pipeline

Every importer should follow the same pipeline:

1. Parse the source format into adapter-native temporary data.
2. Convert project-level data into `KumikoProjectRecord`.
3. Convert every glyph into `KumikoGlyphRecord`.
4. Save project metadata once and glyph records in batches.
5. Build runtime `FontData` from the canonical records for the editor.

Format adapters own the lossy/lossless mapping details; persistence never needs
to know whether a glyph came from Glyphs, UFO, or a binary font.

Importers keep source glyph names verbatim as `glyphId` and never auto-rename to
a "nice name" scheme. The glyphname is the shared cross-format and cross-collaborator
identity (see [Glyph Identity](#glyph-identity-and-the-three-names)), so rewriting
it on import would break component refs and round-trip. Nice-name ↔ production-name
conversion is an export-time choice (the binary `post` table, or an opt-in UFO
export), never an import mutation; when a source provides a production map it is
stored in `production`.

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
hold the same field set, these are lossless structural transforms, not lossy
projections:

- `fontDataToKumikoProjectRecord(...)`
- `fontDataToKumikoGlyphRecords(...)`
- `kumikoRecordsToFontData(...)`

### Loading at CJK Scale

`FontData` being "one object graph for the editor" does not mean every glyph is
resident as a complete `LoadedGlyphData`. At CJK scale the runtime splits into
two tiers:

- A lightweight, always-resident metadata tier: per glyph, the top-level record
  fields that carry no geometry — `glyphId`, `unicodes`, `displayName`,
  `production`, `category` / `subCategory`, `export`, `color`, status, `note`,
  metrics keys, and `componentGlyphIds`.
  This tier alone drives the overview grid's labels, search, filtering, and
  cross-glyph queries without loading any outlines.
- A heavy, on-demand geometry tier: `layers` (paths, components, anchors,
  guidelines, hints, images). Loaded per glyph when the glyph is edited,
  rendered, or needed to resolve another glyph's component, and evicted under an
  LRU budget.

The overview also renders outlines, but it is virtualized: only glyphs in or near
the viewport have their geometry loaded, so a 30k-glyph font renders the visible
window, not all of it. A glyph drawn purely from components resolves its referents
recursively through the geometry loader; `byComponentRefKey` lets that loader and
rename propagation find dependents without scanning every record.

The contract: code that needs only metadata reads the resident tier and never
forces a full geometry load; code that needs outlines first asks the geometry
loader for `LoadedGlyphData`. Export and any genuinely font-wide geometry pass
loads in batches and streams, rather than materializing all layers at once.

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

Persistence and dirty state split into distinct concepts:

| Target concept       | Lifetime          | Meaning                                                                    |
| -------------------- | ----------------- | -------------------------------------------------------------------------- |
| `pendingPersistence` | Runtime only      | Changes exist in memory but have not flushed to IndexedDB yet.             |
| `persistenceStatus`  | Runtime/UI        | `idle`, `queued`, `saving`, `saved`, or `error`.                           |
| `exportDirty`        | Persisted/indexed | Canonical local project/glyph differs from the last exported target state. |
| `syncDirty`          | Persisted/indexed | Canonical local project/glyph differs from the last Git/source sync point. |

Initial flag state after import depends on the source:

| Import source                       | `exportDirty` | `syncDirty`              |
| ----------------------------------- | ------------- | ------------------------ |
| Local file (`.glyphs`, UFO, binary) | `0`           | `0` (no sync target)     |
| GitHub                              | `0`           | `0` (matches the commit) |

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
enqueue both the project metadata and the affected glyph records; deletions and
the old side of a rename remove their `kumiko_glyphs` records outright.

Autosave writes must be ordered and transactional:

- Each queued write carries a monotonically increasing runtime revision. A slow
  older write must not overwrite a newer edit that has already reached
  IndexedDB.
- Add, rename, delete, reorder, and any operation that rewrites references must
  update `kumiko_projects` and all affected `kumiko_glyphs` records in one
  IndexedDB transaction.
- Rename is atomic: the transaction deletes the old key, writes the new key,
  updates `glyphOrder`, and rewrites component refs, kerning pairs/groups, and
  metric keys together.
- Delete is atomic: the transaction removes the glyph record and updates
  `glyphOrder` plus all references that must no longer point at the deleted
  glyph.
- A metadata-only patch cannot replace an unloaded full glyph record; it updates
  only the patched top-level fields and leaves `layers`, derived component refs,
  digests, and source metadata intact unless the operation intentionally changes
  them.

Multi-tab editing needs an explicit policy before autosave ships. Prefer a
single-writer project lock stored in IndexedDB and coordinated by
`BroadcastChannel`; a second tab may open the project read-only or ask to take
over after the first writer releases/stales out. If the implementation chooses
last-write-wins instead, it must be documented as such and surface conflict
warnings for external sync, because silent multi-tab overwrites are especially
dangerous with background saves.

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
- Block export, commit, push, and tab close while a required flush is still
  failing; otherwise the external target can be built from stale local records.

## Migration Plan

The project has not shipped yet and has no users, so there is no data to migrate
and no backward compatibility to preserve. The cutover is a clean reset:

1. Bump the IndexedDB version. In `onupgradeneeded`, delete every existing store
   — `projects`, `project_summaries`, and the whole `ufo_*` family
   (`ufo_projects`, `ufo_metadata`, `ufo_glyphs`, `ufo_ui_state`) — and create
   only `kumiko_projects`, `kumiko_glyphs`, and `kumiko_ui_state` with the
   indexes above. No record-level migration runs; old local databases are
   discarded on upgrade.
2. Extract the current UFO per-glyph persistence helpers into generic Kumiko
   project/glyph persistence helpers, then delete the UFO-specific stores and the
   `UfoGlyphRecord` path once nothing reads them.
3. Convert UFO import to write `KumikoGlyphRecord` instead of `UfoGlyphRecord`.
4. Convert Glyphs import to write the same records.
5. Convert binary import to write the same records and stop persisting
   `binarySource` buffers in long-term project state.
6. Change project load/save so `projects.fontData` is gone as a stored shape;
   `FontData` is assembled from canonical records only.
7. Replace manual draft save with debounced local autosave into canonical
   records.
8. Keep `FontData` as the editor runtime view assembled from canonical records,
   loaded in the two tiers from [Loading at CJK Scale](#loading-at-cjk-scale).
