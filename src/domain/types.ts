import type {
  GlyphSelector,
  OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures/types'

export type OnCurveNodeType = 'corner' | 'smooth'
export type NodeType = OnCurveNodeType
export type PathNodeKind = 'oncurve' | 'offcurve'
export type PathSegmentType = 'line' | 'cubic' | 'quadratic'
export type KumikoColor = [number, number, number, number]

export type GlyphCustomData = Record<string, unknown>
export type GlyphSourceData = Record<string, unknown>

interface BasePathNode {
  id: string
  x: number
  y: number
  identifier?: string | null
  name?: string | null
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface OnCurvePathNode extends BasePathNode {
  kind: 'oncurve'
  // On-curve nodes carry the segment ending at this node. Off-curve nodes are
  // handles and leave this unset.
  segmentType?: PathSegmentType
  smooth?: boolean
}

export interface OffCurvePathNode extends BasePathNode {
  kind: 'offcurve'
}

export type PathNode = OnCurvePathNode | OffCurvePathNode

export interface PathData {
  id: string
  nodes: PathNode[]
  closed: boolean
  identifier?: string | null
  name?: string | null
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphComponentRef {
  id: string
  identifier?: string | null
  name?: string | null
  glyphId: string
  // Canonical affine transform in DOMMatrix order. Legacy decomposed fields are
  // kept for UI controls and format adapter convenience.
  transform?: {
    a: number
    b: number
    c: number
    d: number
    e: number
    f: number
  }
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  // Off-diagonal 2x2 matrix terms (shear); absent means 0. Together with
  // scaleX/scaleY they carry the full UFO/Glyphs component transform.
  xyScale?: number
  yxScale?: number
  autoAlign?: boolean | null
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphAnchor {
  id: string
  identifier?: string | null
  name: string
  x: number
  y: number
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphGuideline {
  id: string
  identifier?: string | null
  x: number
  y: number
  angle: number
  locked?: boolean
  name?: string
  color?: KumikoColor | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface GlyphMetrics {
  lsb: number
  rsb: number
  width: number
}

export interface GlyphVerticalMetrics {
  height?: number | null
  tsb?: number | null
  bsb?: number | null
}

export interface GlyphImage {
  fileName: string
  xScale?: number
  xyScale?: number
  yxScale?: number
  yScale?: number
  xOffset?: number
  yOffset?: number
  color?: KumikoColor | null
  customData?: GlyphCustomData
}

export type GlyphHint = Record<string, unknown>

export interface GlyphLayerData {
  id: string
  name: string
  // 'master' layers map to font masters (one per master); 'backup' layers are
  // user-kept outline snapshots. Undefined is treated as 'master' for back-compat.
  type?: 'master' | 'backup' | 'brace' | 'bracket'
  associatedMasterId?: string | null
  braceLocation?: Record<string, number> | null
  bracketAxisRules?: Record<string, { min?: number; max?: number }> | null
  paths: PathData[]
  componentRefs: GlyphComponentRef[]
  anchors: GlyphAnchor[]
  guidelines: GlyphGuideline[]
  metrics: GlyphMetrics
  verticalMetrics?: GlyphVerticalMetrics
  hints?: GlyphHint[]
  color?: KumikoColor | null
  visible?: boolean
  locked?: boolean
  background?: GlyphLayerContent | null
  image?: GlyphImage | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

// Content fields of a layer (the fontra StaticGlyph equivalent). All editable
// glyph content lives in a layer, never on GlyphData directly.
export type GlyphLayerContent = Pick<
  GlyphLayerData,
  'paths' | 'componentRefs' | 'anchors' | 'guidelines' | 'metrics'
>

export interface GlyphData {
  id: string
  name: string
  displayName?: string | null
  // Layers are the single source of truth; activeLayerId points at the one being
  // edited/displayed. Content is read via getGlyphLayer / activeLayer.
  activeLayerId?: string | null
  layers?: Record<string, GlyphLayerData>
  layerOrder?: string[]
  componentGlyphIds?: string[]
  hasDrawableContent?: boolean
  unicodes?: string[]
  export?: boolean
  category?: string | null
  subCategory?: string | null
  status?: number | null
  production?: string | null
  note?: string | null
  color?: KumikoColor | null
  leftMetricsKey?: string | null
  rightMetricsKey?: string | null
  widthMetricsKey?: string | null
  customData?: GlyphCustomData
  sourceData?: GlyphSourceData
}

export interface FontData {
  glyphs: Record<string, GlyphData>
  glyphOrder?: string[]
  kerningGroups?: KerningGroup[]
  kerningPairs?: KerningPair[]
  // Pair values for non-default masters, keyed by the master's source id.
  // Convention: every non-default master gets an entry (possibly empty) at
  // import; a master id absent here kerns with the canonical `kerningPairs`
  // (the default master's set). Groups stay font-wide.
  kerningPairsByMaster?: Record<string, KerningPair[]>
  // Vertical (vkrn) kerning, mirroring the horizontal model: values adjust
  // the y-advance in top-to-bottom text. Shares kerningGroups. UFO has no
  // standard storage for this, so sync round-trips it through the lib key
  // com.kumiko.fontEditor.verticalKerning.
  verticalKerningPairs?: KerningPair[]
  verticalKerningPairsByMaster?: Record<string, KerningPair[]>
  fontInfo?: FontInfo
  axes?: FontAxes
  sources?: Record<string, FontSource>
  openTypeFeatures?: OpenTypeFeaturesState
  exportInstances?: FontExportInstance[]
  statusDefinitions?: DevelopmentStatusDefinition[]
  settings?: FontProjectSettings
  unitsPerEm?: number
  lineMetricsHorizontalLayout?: Record<
    string,
    {
      value: number
      zone?: number
    }
  >
}

export interface KerningGroup {
  id: string
  side: 'left' | 'right'
  name: string
  glyphs: string[]
}

export interface KerningPair {
  id?: string
  left: GlyphSelector
  right: GlyphSelector
  value: number
}

export type FontInfoCustomDataValue =
  | string
  | number
  | boolean
  | number[]
  | string[]
  | null

export interface FontInfo {
  familyName?: string
  versionMajor?: number
  versionMinor?: number
  copyright?: string
  trademark?: string
  description?: string
  sampleText?: string
  designer?: string
  designerURL?: string
  manufacturer?: string
  manufacturerURL?: string
  licenseDescription?: string
  licenseInfoURL?: string
  vendorID?: string
  localizedNames?: Record<string, Record<string, string>>
  openTypeNameRecords?: Record<string, Record<string, Record<string, string>>>
  customData: Record<string, FontInfoCustomDataValue>
}

export interface FontAxis {
  name: string
  label: string
  tag: string
  minValue: number
  defaultValue: number
  maxValue: number
  hidden?: boolean
  values?: number[]
  mapping?: Array<[number, number]>
  customData?: Record<string, unknown>
}

export interface CrossAxisMapping {
  description?: string
  groupDescription?: string
  inputLocation: Record<string, number>
  outputLocation: Record<string, number>
}

export interface FontAxes {
  axes: FontAxis[]
  mappings: CrossAxisMapping[]
  customData?: Record<string, unknown>
}

export interface FontSource {
  id: string
  name: string
  location: Record<string, number>
  // The UFO package this source came from (multi-UFO designspace projects);
  // sync uses it to write each UFO's own kerning.plist.
  ufoId?: string
  italicAngle?: number
  lineMetricsHorizontalLayout?: Record<string, { value: number; zone?: number }>
  lineMetricsVerticalLayout?: Record<string, { value: number; zone?: number }>
  customData?: Record<string, unknown>
}

export interface FontExportInstance {
  id: string
  name: string
  styleName: string
  location: Record<string, number>
  export: boolean
  fileName?: string
  familyName?: string
  weightClass?: number
  widthClass?: number
  // Style linking (bold/italic bits in OS/2.fsSelection and head.macStyle).
  isBold?: boolean
  isItalic?: boolean
  italicAngle?: number
  customData?: Record<string, unknown>
}

export interface DevelopmentStatusDefinition {
  value: number
  label: string
  color: [number, number, number, number]
  isDefault?: boolean
}

export interface FontProjectSettings {
  fontType?: 'static' | 'variable'
  outlineType?: 'cubic' | 'quadratic'
  customParameters?: Record<string, unknown>
  notes?: string
  supplementalText?: string
}
