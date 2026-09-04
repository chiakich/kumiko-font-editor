// Plain data shapes shared by the scene view, the controller, and the layers.

export interface SceneModel {
  glyph?: PositionedGlyph
  glyphs?: PositionedGlyph[]
  lineMetricsHorizontalLayout?: Record<
    string,
    {
      value: number
      zone?: number
    }
  >
  selection?: Set<string>
  hoverSelection?: Set<string>
  selectionRect?: {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
    owner?: 'pointer'
  }
  hoverPathHit?: PathHitInfo
  selectedPathHit?: PathHitInfo
  activeToolIdentifier?: string
  pathConnectTargetPoint?: {
    x: number
    y: number
    kind?: 'insert' | 'close' | 'connect'
  }
  pathInsertHandles?: { points: Array<{ x: number; y: number }> }
  penPreviewPath?: Path2D
  shapePreviewPath?: Path2D
  brushPreviewPath?: Path2D
  // Translucent preview of a component about to be inserted (glyph-local).
  componentGhostPath?: Path2D
  // Destination region of the component being searched (glyph-local).
  componentTargetBox?: {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
  }
  knifeLine?: {
    x1: number
    y1: number
    x2: number
    y2: number
    intersections: Array<{ x: number; y: number }>
  }
  alignmentGuides?: Array<{ x1: number; y1: number; x2: number; y2: number }>
  // Power-ruler measuring line, glyph-local font units. Intersections and
  // distances are recomputed each frame from the current glyph.
  powerRuler?: {
    basePoint: { x: number; y: number }
    directionVector: { x: number; y: number }
  }
  selectionTransformBounds?: {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
    handles: Array<{
      id: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
      x: number
      y: number
    }>
  }
  // Single reference-font character rendered behind the editing glyph
  // (glyph-local, font units). See lib/referenceFont.
  referencePath?: Path2D
  referenceFillColor?: string
  // Non-active glyph layers shown faintly behind the editing layer.
  backdropPaths?: Path2D[]
  // When true, the active layer's outline fill is not drawn.
  hideActiveLayer?: boolean
  textCursor?: { x: number; yMin: number; yMax: number }
  initialClickedPointIndex?: number
  canEdit?: boolean
  // Per-side distribution bands of the font population (glyph-local units).
  structureGuide?: StructureGuideModel
}

export interface StructureGuideSide {
  bearing: number
  isFraming: boolean
  band: { p10: number; p90: number; mode: number } | null
}

export interface StructureGuideModel {
  advance: number
  bodyTop: number
  bodyBottom: number
  sides: Record<'left' | 'right' | 'top' | 'bottom', StructureGuideSide>
}

export interface PathHitInfo {
  segment: {
    points: { x: number; y: number }[]
    pointIndices: number[]
    type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
    contourIndex?: number
    key?: string
  }
  x: number
  y: number
}

export interface PositionedGlyph {
  glyph: GlyphData
  glyphId?: string
  displayCharacter?: string | null
  x: number
  y: number
  pointRefs?: Array<{ pathId: string; nodeId: string }>
  isEditing?: boolean
  isEmpty?: boolean
  isHovered?: boolean
  isSelected?: boolean
  sourceGlyphIds?: string[]
  sourceStartIndex?: number
  sourceLength?: number
}

export interface GlyphData {
  path: {
    iterPoints(): Generator<Point & { index: number }, void>
    iterHandles(): Generator<[Point, Point], void>
    iterContours(): Generator<{ points: Point[]; isClosed: boolean }, void>
    iterContourSegments?(contourIndex: number): Generator<
      {
        points: Point[]
        pointIndices: number[]
        type?: 'line' | 'quad' | 'cubic' | 'quadBlob'
      },
      void
    >
    appendUnpackedContour?(contour: {
      points: Point[]
      isClosed: boolean
    }): void
    setPoint?(index: number, point: Point): void
    getPoint?(index: number): Point
    contourToPath2D?(contourIndex: number): Path2D
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
    pointTypes?: Uint8Array
    coordinates?: Float64Array
    toPath2D(): Path2D
    getControlBounds():
      | { xMin: number; yMin: number; xMax: number; yMax: number }
      | undefined
    numContours: number
  }
  components?: ComponentData[]
  guidelines?: GuidelineData[]
  xAdvance: number
  metrics?: {
    lsb: number
    rsb: number
    width: number
  }
  inkBounds?: {
    xMin: number
    xMax: number
  }
  kerningWithPrevious?: number
  previousAdvanceEndX?: number
  flattenedPath2d?: Path2D
  closedContoursPath2d?: Path2D
  componentsPath?: {
    iterPoints(): Generator<Point, void>
    iterHandles(): Generator<[Point, Point], void>
  }
}

export interface Point {
  x: number
  y: number
  type?: 'onCurve' | 'offCurveQuad' | 'offCurveCubic'
  smooth?: boolean
}

export interface ComponentData {
  name: string
  transformation: {
    translateX: number
    translateY: number
    scaleX?: number
    scaleY?: number
    rotation?: number
  }
  path2d?: Path2D
}

export interface GuidelineData {
  x: number
  y: number
  angle: number
  locked?: boolean
}
