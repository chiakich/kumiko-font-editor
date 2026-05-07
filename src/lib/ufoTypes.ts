import type { GitHubProjectSource } from 'src/lib/projectTypes'

export interface UfoProjectRecord {
  projectId: string
  title: string
  sourceFolderName: string
  ufoIds: string[]
  selectedUfoId: string | null
  createdAt: number
  updatedAt: number
  sourceType?: 'local' | 'github'
  githubSource?: UfoGithubSource | null
}

export type UfoGithubSource = GitHubProjectSource

export interface UfoLayerRecord {
  layerId: string
  glyphDir: string
}

export interface UfoMetadataRecord {
  projectId: string
  ufoId: string
  relativePath: string
  metainfo: Record<string, unknown> | null
  fontinfo: Record<string, unknown> | null
  lib: Record<string, unknown> | null
  groups: Record<string, unknown> | null
  kerning: Record<string, unknown> | null
  featuresText: string | null
  layers: UfoLayerRecord[]
  contents: Record<string, string>
  glyphOrder: string[]
  updatedAt: number
}

export interface UfoGlyphAdvance {
  width: number | null
  height: number | null
}

export interface UfoGlyphPoint {
  x: number
  y: number
  type?: 'move' | 'line' | 'offcurve' | 'curve' | 'qcurve'
  smooth?: boolean
  name?: string | null
}

export interface UfoGlyphContour {
  points: UfoGlyphPoint[]
}

export interface UfoGlyphComponent {
  base: string
  identifier?: string | null
  xScale?: number
  xyScale?: number
  yxScale?: number
  yScale?: number
  xOffset?: number
  yOffset?: number
}

export interface UfoGlyphAnchor {
  x: number
  y: number
  name: string
  color?: string | null
  identifier?: string | null
}

export interface UfoGlyphGuideline {
  x?: number | null
  y?: number | null
  angle?: number | null
  name?: string | null
  color?: string | null
  identifier?: string | null
}

export interface UfoGlyphImage {
  fileName: string
  xScale?: number
  xyScale?: number
  yxScale?: number
  yScale?: number
  xOffset?: number
  yOffset?: number
  color?: string | null
}

export interface UfoGlyphRecord {
  projectId: string
  ufoId: string
  layerId: string
  glyphName: string
  fileName: string
  sourceHash: string | null
  unicodes: string[]
  advance: UfoGlyphAdvance
  anchors: UfoGlyphAnchor[]
  guidelines: UfoGlyphGuideline[]
  contours: UfoGlyphContour[]
  components: UfoGlyphComponent[]
  note: string | null
  image: UfoGlyphImage | null
  lib: Record<string, unknown> | null
  dirty: boolean
  dirtyIndex: 0 | 1
  updatedAt: number
}

export interface UfoUiStateRecord {
  projectId: string
  key: string
  value: unknown
}

export type UfoGlyphPrimaryKey = [string, string, string, string]

export interface UfoLocalSaveManifest {
  files: Record<string, string>
}
