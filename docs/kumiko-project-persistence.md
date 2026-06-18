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

| Store             | Key                    | Purpose                                                                      |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `kumiko_projects` | `projectId`            | Project metadata, font-level data, source hints, and timestamps.             |
| `kumiko_glyphs`   | `[projectId, glyphId]` | One canonical glyph record containing all layers for that glyph.             |
| `kumiko_ui_state` | `[projectId, key]`     | Editor UI state, dirty lists, selected glyph/layer, and non-font user state. |

Recommended `kumiko_glyphs` indexes:

- `byProject`: `projectId`
- `byProjectDirty`: `[projectId, dirtyIndex]`
- `byUnicode`: `unicodes`, `multiEntry: true`
- `byName`: `[projectId, name]`

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

  sourceData?: KumikoProjectSourceData
}
```

`sourceData` is for non-vector source metadata that has no canonical Kumiko
field yet. It may contain original names, ids, ordering, custom parameters, UFO
layer directory names, Glyphs package names, or Git sync hashes. It must not
contain raw `.glyphs`, `.glif`, `paths`, `shapes`, `contours`, or components as
a second copy of geometry.

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

```ts
interface KumikoGlyphRecord {
  schemaVersion: 1
  projectId: string
  glyphId: string
  name: string
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
  dirty: boolean
  dirtyIndex: 0 | 1
  updatedAt: number
}
```

`unicodes` is an array even though the current editor often uses one codepoint;
UFO and Glyphs can both carry multiple unicode values.

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
  customData?: Record<string, unknown>
  sourceData?: KumikoLayerSourceData
}
```

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
7. Keep `FontData` as the editor runtime view assembled from canonical records.
