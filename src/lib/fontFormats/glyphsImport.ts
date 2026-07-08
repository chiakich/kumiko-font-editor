import type { GlyphsDocument } from 'src/lib/fontFormats/glyphsDocument'
import { buildRawFeatureSnippetsFromGlyphsDocument } from 'src/lib/fontFormats/glyphsFeatures'
import { classifyRawFeatureTextSource } from 'src/lib/openTypeFeatures/classifyRawFeatureText'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { setRawFeatureSnippetsSource } from 'src/lib/openTypeFeatures/featureSourceSections'
import type {
  FontAxes,
  FontAxis,
  FontData,
  FontSource,
  GlyphComponentRef,
  GlyphData,
  GlyphImage,
  GlyphLayerData,
  GlyphLayerContent,
  GlyphSourceData,
  GlyphMetrics,
  KumikoColor,
  PathData,
  PathNode,
  PathSegmentType,
} from 'src/store'
import { parseGlyphsLabelColor } from 'src/lib/color/kumikoColor'
import { normalizeUnicodeHex } from 'src/lib/project/unicode'

// Build a multi-master FontData from a parsed .glyphs / .glyphspackage document
// (the OpenStep structure produced by parseOpenStep / readGlyphsPackageFromFiles).
// Handles both Glyphs 2 (string nodes, paths + components) and Glyphs 3 (tuple
// nodes inside shapes). Inverse of the serializer in glyphsExport.ts.

type Raw = Record<string, unknown>

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : []

const asRecord = (value: unknown): Raw =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Raw)
    : {}

const compactRecord = (value: Raw): Raw | null => {
  const entries = Object.entries(value).filter(
    ([, entryValue]) => entryValue !== undefined
  )
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

const asString = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : null

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

// Glyphs masters carry a stable GUID in `id`; fall back to name/index so a master
// always has a usable source id even on hand-written files.
const masterId = (master: Raw, index: number): string =>
  asString(master.id) ?? asString(master.name) ?? `master-${index}`

const masterName = (master: Raw, location: Record<string, number>): string => {
  const explicit =
    asString(master.name) ??
    asString(master.customName) ??
    [asString(master.weight), asString(master.width), asString(master.custom)]
      .filter(Boolean)
      .join(' ')
  if (explicit) {
    return explicit
  }
  // Fall back to a location label so an unnamed master is still identifiable.
  const label = Object.entries(location)
    .map(([axis, value]) => `${axis} ${value}`)
    .join(' ')
  return label || 'Master'
}

interface AxisDef {
  name: string
  tag: string
  // Index into a master's `axesValues` (Glyphs 3) when >= 0; otherwise the
  // location value is read from a Glyphs 2 master field.
  axesValueIndex: number
  g2Field?: 'weightValue' | 'widthValue' | 'customValue'
}

const G2_AXIS_DEFAULTS: Array<{
  tag: string
  name: string
  field: 'weightValue' | 'widthValue' | 'customValue'
}> = [
  { tag: 'wght', name: 'Weight', field: 'weightValue' },
  { tag: 'wdth', name: 'Width', field: 'widthValue' },
  { tag: 'XXXX', name: 'Custom', field: 'customValue' },
]

// Resolve the axis definitions: Glyphs 3 declares them in `Axes`; Glyphs 2 has no
// Axes block, so derive weight/width/custom axes only when masters actually vary.
const resolveAxisDefs = (
  document: GlyphsDocument,
  masters: Raw[]
): AxisDef[] => {
  const declared = asArray((document as Raw).Axes)
  if (declared.length > 0) {
    return declared.map((entry, index) => {
      const axis = asRecord(entry)
      return {
        name: asString(axis.Name) ?? asString(axis.name) ?? `axis${index}`,
        tag: asString(axis.Tag) ?? asString(axis.tag) ?? `AX${index}`,
        axesValueIndex: index,
      }
    })
  }

  const defs: AxisDef[] = []
  for (const { tag, name, field } of G2_AXIS_DEFAULTS) {
    const values = masters.map((master) => asNumber(master[field], 100))
    const varies = values.some((value) => value !== values[0])
    // Always keep a weight axis (Glyphs treats it as the primary axis) so even a
    // single-master file gets a sane design space; only add width/custom when used.
    if (field === 'weightValue' || varies) {
      defs.push({ name, tag, axesValueIndex: -1, g2Field: field })
    }
  }
  return defs
}

const masterLocation = (
  master: Raw,
  axisDefs: AxisDef[]
): Record<string, number> => {
  const axesValues = asArray(master.axesValues)
  const location: Record<string, number> = {}
  for (const def of axisDefs) {
    if (def.axesValueIndex >= 0) {
      location[def.name] = asNumber(axesValues[def.axesValueIndex], 0)
    } else if (def.g2Field) {
      location[def.name] = asNumber(master[def.g2Field], 100)
    }
  }
  return location
}

const buildFontAxes = (
  axisDefs: AxisDef[],
  masterLocations: Array<Record<string, number>>
): FontAxes => {
  const axes: FontAxis[] = axisDefs.map((def) => {
    const values = masterLocations.map((location) => location[def.name] ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    // The first master is the design-space origin (Glyphs' default master), so
    // its value is the axis default; clamp into the observed range.
    const defaultValue = Math.min(Math.max(values[0] ?? min, min), max)
    return {
      name: def.name,
      label: def.name,
      tag: def.tag,
      minValue: min,
      defaultValue,
      maxValue: max,
    }
  })
  return { axes, mappings: [] }
}

// --- node / contour parsing -------------------------------------------------

const createOnCurveNode = (
  index: number,
  x: number,
  y: number,
  segmentType: PathSegmentType,
  smooth: boolean,
  sourceData?: GlyphSourceData
): PathNode => ({
  id: `n${index}`,
  x,
  y,
  kind: 'oncurve',
  segmentType,
  smooth,
  sourceData,
})

const createOffCurveNode = (
  index: number,
  x: number,
  y: number,
  sourceData?: GlyphSourceData
): PathNode => ({
  id: `n${index}`,
  x,
  y,
  kind: 'offcurve',
  sourceData,
})

// Glyphs 2 node line: "x y TYPE [SMOOTH]".
const parseG2Node = (raw: string, index: number): PathNode | null => {
  const parts = raw.trim().split(/\s+/)
  if (parts.length < 3) {
    return null
  }
  const x = Number(parts[0])
  const y = Number(parts[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }
  const keyword = parts[2].toUpperCase()
  const smooth = parts[3]?.toUpperCase() === 'SMOOTH'
  const extraTokens = parts.slice(smooth ? 4 : 3)
  const sourceData =
    extraTokens.length > 0
      ? glyphsSourceData({ nodeExtraTokens: extraTokens })
      : undefined
  if (keyword === 'OFFCURVE') {
    return createOffCurveNode(index, x, y, sourceData)
  }
  const segmentType =
    keyword === 'QCURVE' ? 'quadratic' : keyword === 'CURVE' ? 'cubic' : 'line'
  return createOnCurveNode(index, x, y, segmentType, smooth, sourceData)
}

// Glyphs 3 node tuple: (x, y, type) where type is l/ls/c/cs/o/q/qs.
const parseG3Node = (raw: unknown, index: number): PathNode | null => {
  const tuple = asArray(raw)
  if (tuple.length < 3) {
    return null
  }
  const x = asNumber(tuple[0])
  const y = asNumber(tuple[1])
  const code = (asString(tuple[2]) ?? 'l').toLowerCase()
  const sourceData =
    tuple.length > 3
      ? glyphsSourceData({ nodeTupleExtra: tuple.slice(3) })
      : undefined
  if (code.startsWith('o')) {
    return createOffCurveNode(index, x, y, sourceData)
  }
  const segmentType = code.startsWith('q')
    ? 'quadratic'
    : code.startsWith('c')
      ? 'cubic'
      : 'line'
  return createOnCurveNode(
    index,
    x,
    y,
    segmentType,
    code.endsWith('s'),
    sourceData
  )
}

const isOnCurveNode = (
  node: PathNode
): node is Extract<PathNode, { kind: 'oncurve' }> => node.kind === 'oncurve'

const layerHasSegmentType = (
  paths: PathData[],
  segmentType: Exclude<PathSegmentType, 'line'>
) =>
  paths.some((path) =>
    path.nodes.some(
      (node) => isOnCurveNode(node) && node.segmentType === segmentType
    )
  )

const cubicHandle = (
  id: string,
  x: number,
  y: number
): Extract<PathNode, { kind: 'offcurve' }> => ({
  id,
  x,
  y,
  kind: 'offcurve',
})

const cubicOnCurve = (
  node: Extract<PathNode, { kind: 'oncurve' }>
): Extract<PathNode, { kind: 'oncurve' }> => ({
  ...node,
  segmentType: 'cubic',
})

const midpoint = (
  left: Pick<PathNode, 'x' | 'y'>,
  right: Pick<PathNode, 'x' | 'y'>
) => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2,
})

const quadraticToCubicHandles = (
  start: Pick<PathNode, 'x' | 'y'>,
  control: Pick<PathNode, 'x' | 'y'>,
  end: Pick<PathNode, 'x' | 'y'>
) => ({
  first: {
    x: start.x + (2 / 3) * (control.x - start.x),
    y: start.y + (2 / 3) * (control.y - start.y),
  },
  second: {
    x: end.x + (2 / 3) * (control.x - end.x),
    y: end.y + (2 / 3) * (control.y - end.y),
  },
})

const convertQuadraticSegmentToCubics = (
  start: Extract<PathNode, { kind: 'oncurve' }>,
  handles: Array<Extract<PathNode, { kind: 'offcurve' }>>,
  end: Extract<PathNode, { kind: 'oncurve' }>,
  segmentIndex: number
): PathNode[] => {
  if (handles.length === 0) {
    return [{ ...end, segmentType: 'line' }]
  }

  const converted: PathNode[] = []
  let segmentStart: Pick<PathNode, 'x' | 'y'> = start

  handles.forEach((handle, handleIndex) => {
    const isLastHandle = handleIndex === handles.length - 1
    const segmentEnd = isLastHandle
      ? { x: end.x, y: end.y }
      : midpoint(handle, handles[handleIndex + 1]!)
    const cubic = quadraticToCubicHandles(segmentStart, handle, segmentEnd)
    const idPrefix = `${end.id}_q${segmentIndex}_${handleIndex}`

    converted.push(
      cubicHandle(`${idPrefix}_h1`, cubic.first.x, cubic.first.y),
      cubicHandle(`${idPrefix}_h2`, cubic.second.x, cubic.second.y)
    )

    if (isLastHandle) {
      converted.push(cubicOnCurve(end))
    } else {
      converted.push({
        id: `${idPrefix}_implied`,
        x: segmentEnd.x,
        y: segmentEnd.y,
        kind: 'oncurve',
        segmentType: 'cubic',
        smooth: true,
      })
    }

    segmentStart = segmentEnd
  })

  return converted
}

const convertQuadraticPathToCubic = (path: PathData): PathData => {
  let previousOnCurve: Extract<PathNode, { kind: 'oncurve' }> | null =
    path.closed
      ? (path.nodes.findLast((node) => isOnCurveNode(node)) as Extract<
          PathNode,
          { kind: 'oncurve' }
        > | null)
      : null
  let pendingOffCurves: Array<Extract<PathNode, { kind: 'offcurve' }>> = []
  const nodes: PathNode[] = []

  path.nodes.forEach((node, index) => {
    if (!isOnCurveNode(node)) {
      pendingOffCurves.push(node)
      return
    }

    if (node.segmentType === 'quadratic' && previousOnCurve) {
      nodes.push(
        ...convertQuadraticSegmentToCubics(
          previousOnCurve,
          pendingOffCurves,
          node,
          index
        )
      )
    } else {
      nodes.push(...pendingOffCurves, node)
    }

    pendingOffCurves = []
    previousOnCurve = node
  })

  nodes.push(...pendingOffCurves)
  return { ...path, nodes }
}

const normalizeMixedOutlinePaths = (paths: PathData[]): PathData[] => {
  if (
    !layerHasSegmentType(paths, 'cubic') ||
    !layerHasSegmentType(paths, 'quadratic')
  ) {
    return paths
  }

  return paths.map(convertQuadraticPathToCubic)
}

const parseTransformString = (value: string): number[] | null => {
  const numbers = value
    .replace(/[{}()]/g, '')
    .split(',')
    .map((part) => Number(part.trim()))
  if (numbers.length === 6 && numbers.every((n) => Number.isFinite(n))) {
    return numbers
  }
  return null
}

// Read an (x, y) point from either a Glyphs 3 tuple `(x, y)` or a Glyphs 2
// quoted string `"{x, y}"`.
const parsePoint = (value: unknown): { x: number; y: number } | null => {
  if (Array.isArray(value)) {
    return { x: asNumber(value[0]), y: asNumber(value[1]) }
  }
  if (typeof value === 'string') {
    const numbers = value
      .replace(/[{}()]/g, '')
      .split(',')
      .map((part) => Number(part.trim()))
    if (
      numbers.length >= 2 &&
      Number.isFinite(numbers[0]) &&
      Number.isFinite(numbers[1])
    ) {
      return { x: numbers[0], y: numbers[1] }
    }
  }
  return null
}

const parseNumberRecord = (value: unknown): Record<string, number> | null => {
  const record = asRecord(value)
  const entries = Object.entries(record)
    .map(
      ([key, entryValue]) => [key, asNumber(entryValue, Number.NaN)] as const
    )
    .filter(([, entryValue]) => Number.isFinite(entryValue))
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

const parseAxisRules = (
  value: unknown
): Record<string, { min?: number; max?: number }> | null => {
  const record = asRecord(value)
  const entries = Object.entries(record).flatMap(([axisName, axisValue]) => {
    const axisRule = asRecord(axisValue)
    const min = asNumber(axisRule.min, Number.NaN)
    const max = asNumber(axisRule.max, Number.NaN)
    const rule = {
      ...(Number.isFinite(min) ? { min } : {}),
      ...(Number.isFinite(max) ? { max } : {}),
    }
    return Object.keys(rule).length > 0 ? [[axisName, rule] as const] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) {
    return undefined
  }
  return value === 1 || value === true
}

const parseCustomData = (value: unknown): GlyphSourceData | undefined => {
  const record = compactRecord(asRecord(value))
  return record ?? undefined
}

const GLYPHS_GLYPH_CANONICAL_KEYS = new Set([
  'glyphname',
  'name',
  'unicode',
  'unicodes',
  'production',
  'category',
  'subCategory',
  'export',
  'note',
  'leftMetricsKey',
  'rightMetricsKey',
  'widthMetricsKey',
  'userData',
  'layers',
])

const GLYPHS_LAYER_CANONICAL_KEYS = new Set([
  'layerId',
  'associatedMasterId',
  'name',
  'width',
  'paths',
  'components',
  'shapes',
  'anchors',
  'guides',
  'guideLines',
  'attributes',
  'backgroundImage',
  'background',
  'image',
  'hints',
  'locked',
  'visible',
  'userData',
])

const GLYPHS_PATH_CANONICAL_KEYS = new Set([
  'closed',
  'nodes',
  'id',
  'identifier',
  'name',
  'userData',
])

const GLYPHS_COMPONENT_CANONICAL_KEYS = new Set([
  'name',
  'ref',
  'transform',
  'pos',
  'position',
  'scale',
  'angle',
  'automaticAlignment',
  'id',
  'identifier',
  'userData',
])

const GLYPHS_ANCHOR_CANONICAL_KEYS = new Set([
  'name',
  'pos',
  'position',
  'id',
  'identifier',
  'userData',
])

const GLYPHS_GUIDE_CANONICAL_KEYS = new Set([
  'pos',
  'position',
  'angle',
  'locked',
  'name',
  'id',
  'identifier',
  'userData',
])

const extractGlyphsSourceFields = (
  record: Raw,
  canonicalKeys: Set<string>
): Record<string, unknown> | undefined => {
  const fields = Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => !canonicalKeys.has(key) && value !== undefined
    )
  )
  return compactRecord(fields) ?? undefined
}

const glyphsSourceData = (
  fields: Record<string, unknown> | undefined
): GlyphSourceData | undefined =>
  fields ? ({ glyphs: { fields } } as GlyphSourceData) : undefined

const parseIdentifier = (record: Raw): string | null =>
  asString(record.identifier) ?? asString(record.id)

const parseGlyphsImage = (layer: Raw): GlyphImage | null => {
  const image = asRecord(layer.backgroundImage ?? layer.image)
  const fileName =
    asString(image.path) ??
    asString(image.fileName) ??
    asString(image.name) ??
    asString(image.imagePath)
  if (!fileName) {
    return null
  }
  const transform =
    typeof image.transform === 'string'
      ? parseTransformString(image.transform)
      : Array.isArray(image.transform)
        ? image.transform.map((value) => asNumber(value))
        : null
  const customData = compactRecord(
    Object.fromEntries(
      Object.entries(image).filter(
        ([key, value]) =>
          !['path', 'fileName', 'name', 'imagePath', 'transform'].includes(
            key
          ) && value !== undefined
      )
    )
  )
  return {
    fileName,
    ...(transform && transform.length === 6
      ? {
          xScale: transform[0],
          xyScale: transform[1],
          yxScale: transform[2],
          yScale: transform[3],
          xOffset: transform[4],
          yOffset: transform[5],
        }
      : {}),
    ...(customData ? { customData } : {}),
  }
}

const isNonEmptyLayerContent = (content: GlyphLayerContent) =>
  content.paths.length > 0 ||
  content.componentRefs.length > 0 ||
  content.anchors.length > 0 ||
  content.guidelines.length > 0

const parseGlyphsBackground = (layer: Raw): GlyphLayerContent | null => {
  const backgroundRecord = asRecord(layer.background)
  if (Object.keys(backgroundRecord).length === 0) {
    return null
  }
  const content = parseLayerContent(backgroundRecord)
  const background: GlyphLayerContent = {
    paths: content.paths,
    componentRefs: content.componentRefs,
    anchors: content.anchors,
    guidelines: content.guidelines,
    metrics: {
      width: content.width || asNumber(layer.width, 0),
      lsb: 0,
      rsb: content.width || asNumber(layer.width, 0),
    },
  }
  return isNonEmptyLayerContent(background) ? background : null
}

const parseGlyphsHints = (value: unknown): GlyphLayerData['hints'] => {
  const hints = asArray(value)
    .map((entry) => compactRecord(asRecord(entry)))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
  return hints.length > 0 ? hints : undefined
}

const componentFromMatrix = (
  name: string,
  matrix: number[],
  index: number,
  autoAlign?: boolean | null
): GlyphComponentRef => ({
  id: `c${index}`,
  glyphId: name,
  scaleX: matrix[0],
  xyScale: matrix[1],
  yxScale: matrix[2],
  scaleY: matrix[3],
  x: matrix[4],
  y: matrix[5],
  rotation: 0,
  autoAlign,
})

interface ParsedLayerContent {
  paths: PathData[]
  componentRefs: GlyphComponentRef[]
  anchors: GlyphLayerData['anchors']
  guidelines: GlyphLayerData['guidelines']
  width: number
}

const parseAnchors = (layer: Raw): GlyphLayerData['anchors'] =>
  asArray(layer.anchors).map((entry, index) => {
    const anchor = asRecord(entry)
    const point = parsePoint(anchor.pos ?? anchor.position)
    return {
      id: parseIdentifier(anchor) ?? `a${index}`,
      identifier: parseIdentifier(anchor),
      name: asString(anchor.name) ?? `anchor${index}`,
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      customData: parseCustomData(anchor.userData),
      sourceData: glyphsSourceData(
        extractGlyphsSourceFields(anchor, GLYPHS_ANCHOR_CANONICAL_KEYS)
      ),
    }
  })

const parseGuidelines = (layer: Raw): GlyphLayerData['guidelines'] =>
  asArray(layer.guides ?? layer.guideLines).map((entry, index) => {
    const guide = asRecord(entry)
    const point = parsePoint(guide.pos ?? guide.position)
    const x = point?.x ?? 0
    const y = point?.y ?? 0
    return {
      id: parseIdentifier(guide) ?? `g${index}`,
      identifier: parseIdentifier(guide),
      x,
      y,
      angle: asNumber(guide.angle),
      locked: guide.locked === 1 || guide.locked === true,
      ...(asString(guide.name) ? { name: asString(guide.name)! } : {}),
      customData: parseCustomData(guide.userData),
      sourceData: glyphsSourceData(
        extractGlyphsSourceFields(guide, GLYPHS_GUIDE_CANONICAL_KEYS)
      ),
    }
  })

const parseLayerContent = (layer: Raw): ParsedLayerContent => {
  const paths: PathData[] = []
  const componentRefs: GlyphComponentRef[] = []

  const pushG2Path = (entry: unknown, pathIndex: number) => {
    const path = asRecord(entry)
    const nodes = asArray(path.nodes)
      .map((node, nodeIndex) =>
        typeof node === 'string'
          ? parseG2Node(node, nodeIndex)
          : parseG3Node(node, nodeIndex)
      )
      .filter((node): node is PathNode => Boolean(node))
    paths.push({
      id: parseIdentifier(path) ?? `p${pathIndex}`,
      identifier: parseIdentifier(path),
      name: asString(path.name),
      closed:
        path.closed === 1 || path.closed === true || path.closed === undefined,
      nodes,
      customData: parseCustomData(path.userData),
      sourceData: glyphsSourceData(
        extractGlyphsSourceFields(path, GLYPHS_PATH_CANONICAL_KEYS)
      ),
    })
  }

  const pushG2Component = (entry: unknown, index: number) => {
    const component = asRecord(entry)
    const name = asString(component.name) ?? asString(component.ref)
    if (!name) {
      return
    }
    const transform =
      typeof component.transform === 'string'
        ? parseTransformString(component.transform)
        : null
    componentRefs.push(
      transform
        ? componentFromMatrix(
            name,
            transform,
            index,
            component.automaticAlignment === undefined
              ? null
              : component.automaticAlignment === 1 ||
                  component.automaticAlignment === true
          )
        : componentFromMatrix(
            name,
            [1, 0, 0, 1, 0, 0],
            index,
            component.automaticAlignment === undefined
              ? null
              : component.automaticAlignment === 1 ||
                  component.automaticAlignment === true
          )
    )
    const ref = componentRefs[componentRefs.length - 1]
    ref.identifier = parseIdentifier(component)
    ref.customData = parseCustomData(component.userData)
    ref.sourceData = glyphsSourceData(
      extractGlyphsSourceFields(component, GLYPHS_COMPONENT_CANONICAL_KEYS)
    )
  }

  // Glyphs 3: geometry lives in `shapes` (a contour has `nodes`, a component has `ref`).
  const shapes = asArray(layer.shapes)
  if (shapes.length > 0) {
    shapes.forEach((entry, index) => {
      const shape = asRecord(entry)
      const ref = asString(shape.ref)
      if (ref) {
        const transform =
          typeof shape.transform === 'string'
            ? parseTransformString(shape.transform)
            : Array.isArray(shape.transform)
              ? shape.transform.map((v) => asNumber(v))
              : null
        if (transform && transform.length === 6) {
          componentRefs.push(
            componentFromMatrix(
              ref,
              transform,
              index,
              shape.automaticAlignment === undefined
                ? null
                : shape.automaticAlignment === 1 ||
                    shape.automaticAlignment === true
            )
          )
          const component = componentRefs[componentRefs.length - 1]
          component.identifier = parseIdentifier(shape)
          component.customData = parseCustomData(shape.userData)
          component.sourceData = glyphsSourceData(
            extractGlyphsSourceFields(shape, GLYPHS_COMPONENT_CANONICAL_KEYS)
          )
          return
        }
        const pos = asArray(shape.pos)
        const scale = asArray(shape.scale)
        componentRefs.push({
          id: `c${index}`,
          glyphId: ref,
          x: asNumber(pos[0]),
          y: asNumber(pos[1]),
          scaleX: scale.length ? asNumber(scale[0], 1) : 1,
          scaleY: scale.length ? asNumber(scale[1], 1) : 1,
          rotation: asNumber(shape.angle),
          xyScale: 0,
          yxScale: 0,
          autoAlign:
            shape.automaticAlignment === undefined
              ? null
              : shape.automaticAlignment === 1 ||
                shape.automaticAlignment === true,
          identifier: parseIdentifier(shape),
          customData: parseCustomData(shape.userData),
          sourceData: glyphsSourceData(
            extractGlyphsSourceFields(shape, GLYPHS_COMPONENT_CANONICAL_KEYS)
          ),
        })
        return
      }
      const nodes = asArray(shape.nodes)
        .map((node, nodeIndex) =>
          typeof node === 'string'
            ? parseG2Node(node, nodeIndex)
            : parseG3Node(node, nodeIndex)
        )
        .filter((node): node is PathNode => Boolean(node))
      paths.push({
        id: parseIdentifier(shape) ?? `p${index}`,
        identifier: parseIdentifier(shape),
        name: asString(shape.name),
        closed:
          shape.closed === 1 ||
          shape.closed === true ||
          shape.closed === undefined,
        nodes,
        customData: parseCustomData(shape.userData),
        sourceData: glyphsSourceData(
          extractGlyphsSourceFields(shape, GLYPHS_PATH_CANONICAL_KEYS)
        ),
      })
    })
  } else {
    // Glyphs 2: separate `paths` and `components` arrays.
    asArray(layer.paths).forEach(pushG2Path)
    asArray(layer.components).forEach(pushG2Component)
  }

  return {
    paths: normalizeMixedOutlinePaths(paths),
    componentRefs,
    anchors: parseAnchors(layer),
    guidelines: parseGuidelines(layer),
    width: asNumber(layer.width, 0),
  }
}

// --- metrics (lsb/rsb via outline + component bounds) -----------------------

interface Bounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const unionBounds = (list: Array<Bounds | null>): Bounds | null => {
  const valid = list.filter((b): b is Bounds => Boolean(b))
  if (valid.length === 0) {
    return null
  }
  return {
    xMin: Math.min(...valid.map((b) => b.xMin)),
    xMax: Math.max(...valid.map((b) => b.xMax)),
    yMin: Math.min(...valid.map((b) => b.yMin)),
    yMax: Math.max(...valid.map((b) => b.yMax)),
  }
}

const pathBounds = (path: PathData): Bounds | null => {
  if (path.nodes.length === 0) {
    return null
  }
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity
  for (const node of path.nodes) {
    xMin = Math.min(xMin, node.x)
    xMax = Math.max(xMax, node.x)
    yMin = Math.min(yMin, node.y)
    yMax = Math.max(yMax, node.y)
  }
  return Number.isFinite(xMin) ? { xMin, xMax, yMin, yMax } : null
}

const transformBounds = (bounds: Bounds, ref: GlyphComponentRef): Bounds => {
  const a = ref.scaleX
  const b = ref.xyScale ?? 0
  const c = ref.yxScale ?? 0
  const d = ref.scaleY
  const e = ref.x
  const f = ref.y
  const corners = [
    [bounds.xMin, bounds.yMin],
    [bounds.xMin, bounds.yMax],
    [bounds.xMax, bounds.yMin],
    [bounds.xMax, bounds.yMax],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
  return {
    xMin: Math.min(...corners.map((p) => p[0])),
    xMax: Math.max(...corners.map((p) => p[0])),
    yMin: Math.min(...corners.map((p) => p[1])),
    yMax: Math.max(...corners.map((p) => p[1])),
  }
}

// Resolve outline bounds for a master, following component references within that
// same master so composite glyphs get a real left/right side bearing.
const buildBoundsResolver = (
  contentByGlyph: Map<string, ParsedLayerContent>
) => {
  const cache = new Map<string, Bounds | null>()
  const resolving = new Set<string>()

  const resolve = (glyphName: string): Bounds | null => {
    if (cache.has(glyphName)) {
      return cache.get(glyphName) ?? null
    }
    if (resolving.has(glyphName)) {
      return null
    }
    const content = contentByGlyph.get(glyphName)
    if (!content) {
      return null
    }
    resolving.add(glyphName)
    const own = unionBounds(content.paths.map(pathBounds))
    const composite = unionBounds(
      content.componentRefs.map((ref) => {
        const base = resolve(ref.glyphId)
        return base ? transformBounds(base, ref) : null
      })
    )
    const result = unionBounds([own, composite])
    resolving.delete(glyphName)
    cache.set(glyphName, result)
    return result
  }

  return resolve
}

const buildMetrics = (
  content: ParsedLayerContent,
  bounds: Bounds | null
): GlyphMetrics => {
  const width = content.width
  const lsb = Math.round(bounds?.xMin ?? 0)
  return {
    width,
    lsb,
    rsb: Math.round(bounds ? width - bounds.xMax : width - lsb),
  }
}

// --- assembly ---------------------------------------------------------------

const firstUnicode = (value: unknown): string | null => {
  // Glyphs 3 writes numeric unicode values as decimal code points
  // (e.g. 65 for U+0041, 983046 for U+F0006). Quoted or A-F-containing
  // values stay strings and are normalized as hex below.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeUnicodeHex(value)
  }
  const raw = asString(value)
  if (!raw) {
    return null
  }
  // Glyphs 3 may store a comma-separated list; keep the first code point.
  const first = raw.split(',')[0]?.trim()
  return normalizeUnicodeHex(first)
}

const buildLineMetrics = (
  master: Raw | undefined
): FontData['lineMetricsHorizontalLayout'] => {
  if (!master) {
    return undefined
  }
  const result: Record<string, { value: number }> = {}
  const keys: Array<[string, string]> = [
    ['ascender', 'ascender'],
    ['descender', 'descender'],
    ['xHeight', 'xHeight'],
    ['capHeight', 'capHeight'],
  ]
  for (const [source, target] of keys) {
    const value = master[source]
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[target] = { value }
    }
  }
  // Glyphs 3 nests these in `metricValues`; fall back to that shape.
  const metricValues = asArray(master.metricValues)
  if (Object.keys(result).length === 0 && metricValues.length > 0) {
    const order = ['ascender', 'capHeight', 'xHeight', 'descender']
    metricValues.forEach((entry, index) => {
      const value = asNumber(asRecord(entry).pos)
      const key = order[index]
      if (key && value) {
        result[key] = { value }
      }
    })
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const extractGlyphOrderCustomParameter = (
  document: GlyphsDocument
): string[] => {
  for (const entry of asArray((document as Raw).customParameters)) {
    const parameter = asRecord(entry)
    if (asString(parameter.name) !== 'glyphOrder') {
      continue
    }
    return asArray(parameter.value).flatMap((value) => {
      const glyphName = asString(value)
      return glyphName ? [glyphName] : []
    })
  }
  return []
}

const mergeGlyphOrder = (
  preferredOrder: string[],
  fallbackOrder: string[],
  glyphs: Record<string, GlyphData>
) => {
  const seen = new Set<string>()
  const order: string[] = []
  const append = (glyphName: string) => {
    if (seen.has(glyphName) || !glyphs[glyphName]) {
      return
    }
    seen.add(glyphName)
    order.push(glyphName)
  }

  preferredOrder.forEach(append)
  fallbackOrder.forEach(append)
  return order
}

export const buildFontDataFromGlyphsDocument = (
  document: GlyphsDocument
): FontData => {
  const masters = asArray((document as Raw).fontMaster).map(asRecord)
  const axisDefs = resolveAxisDefs(document, masters)

  const masterEntries = masters.map((master, index) => {
    const id = masterId(master, index)
    const location = masterLocation(master, axisDefs)
    return { id, master, location, name: masterName(master, location) }
  })
  const masterIdSet = new Set(masterEntries.map((entry) => entry.id))
  const defaultMasterId = masterEntries[0]?.id ?? null

  const sources: Record<string, FontSource> = {}
  for (const entry of masterEntries) {
    sources[entry.id] = {
      id: entry.id,
      name: entry.name,
      location: entry.location,
    }
  }

  const axes = buildFontAxes(
    axisDefs,
    masterEntries.map((entry) => entry.location)
  )

  // Parse every glyph layer up front, then compute metrics per master so
  // composite glyphs can resolve their base bounds.
  const rawGlyphs = asArray((document as Raw).glyphs).map(asRecord)
  interface ParsedGlyph {
    glyphName: string
    unicode: string | null
    production: string | null
    category: string | null
    subCategory: string | null
    exportFlag: boolean
    // layerId/masterId -> content
    layers: Array<{
      key: string
      name: string
      type: NonNullable<GlyphLayerData['type']>
      associatedMasterId: string | null
      braceLocation: Record<string, number> | null
      bracketAxisRules: Record<string, { min?: number; max?: number }> | null
      locked?: boolean
      visible?: boolean
      background?: GlyphLayerContent | null
      image?: GlyphImage | null
      hints?: GlyphLayerData['hints']
      color?: KumikoColor | null
      customData?: GlyphSourceData
      sourceData?: GlyphSourceData
      content: ParsedLayerContent
    }>
    note: string | null
    leftMetricsKey: string | null
    rightMetricsKey: string | null
    widthMetricsKey: string | null
    customData?: GlyphSourceData
    sourceData?: GlyphSourceData
    color?: KumikoColor | null
  }

  const contentByMaster = new Map<string, Map<string, ParsedLayerContent>>()
  for (const id of masterIdSet) {
    contentByMaster.set(id, new Map())
  }

  const parsedGlyphs: ParsedGlyph[] = rawGlyphs.map((rawGlyph) => {
    const glyphName =
      asString(rawGlyph.glyphname) ?? asString(rawGlyph.name) ?? 'glyph'
    const layers: ParsedGlyph['layers'] = []

    for (const entry of asArray(rawGlyph.layers)) {
      const rawLayer = asRecord(entry)
      const layerId =
        asString(rawLayer.layerId) ??
        asString(rawLayer.associatedMasterId) ??
        asString(rawLayer.name) ??
        `layer-${layers.length}`
      const associated =
        asString(rawLayer.associatedMasterId) ??
        (masterIdSet.has(layerId) ? layerId : defaultMasterId)
      const isMaster = masterIdSet.has(layerId)
      const attributes = asRecord(rawLayer.attributes)
      const braceLocation = parseNumberRecord(attributes.coordinates)
      const bracketAxisRules = parseAxisRules(attributes.axisRules)
      const content = parseLayerContent(rawLayer)
      // A master layer is keyed by its master id so getGlyphLayer(glyph, masterId)
      // and the store's master switcher resolve it; backup layers keep their own id.
      layers.push({
        key: layerId,
        name: asString(rawLayer.name) ?? layerId,
        type: isMaster
          ? 'master'
          : bracketAxisRules
            ? 'bracket'
            : braceLocation
              ? 'brace'
              : 'backup',
        associatedMasterId: associated,
        braceLocation,
        bracketAxisRules,
        locked: parseOptionalBoolean(rawLayer.locked),
        visible: parseOptionalBoolean(rawLayer.visible),
        background: parseGlyphsBackground(rawLayer),
        image: parseGlyphsImage(rawLayer),
        hints: parseGlyphsHints(rawLayer.hints),
        color: parseGlyphsLabelColor(rawLayer.color),
        customData: parseCustomData(rawLayer.userData),
        sourceData: glyphsSourceData(
          extractGlyphsSourceFields(rawLayer, GLYPHS_LAYER_CANONICAL_KEYS)
        ),
        content,
      })
      if (isMaster) {
        contentByMaster.get(layerId)?.set(glyphName, content)
      }
    }

    return {
      glyphName,
      unicode: firstUnicode(rawGlyph.unicode ?? rawGlyph.unicodes),
      production: asString(rawGlyph.production),
      category: asString(rawGlyph.category),
      subCategory: asString(rawGlyph.subCategory),
      exportFlag: rawGlyph.export !== 0 && rawGlyph.export !== false,
      note: asString(rawGlyph.note),
      leftMetricsKey: asString(rawGlyph.leftMetricsKey),
      rightMetricsKey: asString(rawGlyph.rightMetricsKey),
      widthMetricsKey: asString(rawGlyph.widthMetricsKey),
      customData: parseCustomData(rawGlyph.userData),
      sourceData: glyphsSourceData(
        extractGlyphsSourceFields(rawGlyph, GLYPHS_GLYPH_CANONICAL_KEYS)
      ),
      color: parseGlyphsLabelColor(rawGlyph.color),
      layers,
    }
  })

  const boundsResolverByMaster = new Map<
    string,
    ReturnType<typeof buildBoundsResolver>
  >()
  for (const [id, map] of contentByMaster) {
    boundsResolverByMaster.set(id, buildBoundsResolver(map))
  }

  const glyphs: Record<string, GlyphData> = {}
  const glyphOrder: string[] = []

  for (const parsed of parsedGlyphs) {
    if (parsed.layers.length === 0) {
      continue
    }
    const layers: Record<string, GlyphLayerData> = {}
    const layerOrder: string[] = []

    for (const layer of parsed.layers) {
      const resolveBounds =
        layer.type === 'master'
          ? boundsResolverByMaster.get(layer.key)
          : layer.associatedMasterId
            ? boundsResolverByMaster.get(layer.associatedMasterId)
            : undefined
      const bounds = resolveBounds ? resolveBounds(parsed.glyphName) : null
      layers[layer.key] = {
        id: layer.key,
        name: layer.name,
        type: layer.type,
        associatedMasterId: layer.associatedMasterId,
        braceLocation: layer.braceLocation,
        bracketAxisRules: layer.bracketAxisRules,
        paths: layer.content.paths,
        componentRefs: layer.content.componentRefs,
        anchors: layer.content.anchors,
        guidelines: layer.content.guidelines,
        metrics: buildMetrics(layer.content, bounds),
        locked: layer.locked,
        visible: layer.visible,
        background: layer.background,
        image: layer.image,
        hints: layer.hints,
        color: layer.color,
        customData: layer.customData,
        sourceData: layer.sourceData,
      }
      layerOrder.push(layer.key)
    }

    const activeLayerId =
      defaultMasterId && layers[defaultMasterId]
        ? defaultMasterId
        : (layerOrder[0] ?? null)

    glyphs[parsed.glyphName] = {
      id: parsed.glyphName,
      name: parsed.glyphName,
      activeLayerId,
      layerOrder,
      layers,
      unicodes: parsed.unicode ? [parsed.unicode] : [],
      production: parsed.production,
      category: parsed.category,
      subCategory: parsed.subCategory,
      export: parsed.exportFlag,
      note: parsed.note,
      leftMetricsKey: parsed.leftMetricsKey,
      rightMetricsKey: parsed.rightMetricsKey,
      widthMetricsKey: parsed.widthMetricsKey,
      customData: parsed.customData,
      sourceData: parsed.sourceData,
      color: parsed.color,
    }
    glyphOrder.push(parsed.glyphName)
  }

  const familyName = asString((document as Raw).familyName)
  const unitsPerEm = asNumber((document as Raw).unitsPerEm, 1000)
  const defaultMaster = masterEntries[0]?.master

  const featureSnippets = buildRawFeatureSnippetsFromGlyphsDocument(document)
  const openTypeFeatures =
    featureSnippets.length > 0
      ? classifyRawFeatureTextSource(
          setRawFeatureSnippetsSource(
            createEmptyOpenTypeFeaturesState(),
            featureSnippets,
            { origin: 'glyphs-import' }
          )
        )
      : undefined

  return {
    glyphs,
    glyphOrder: mergeGlyphOrder(
      extractGlyphOrderCustomParameter(document),
      glyphOrder,
      glyphs
    ),
    axes,
    sources,
    unitsPerEm,
    ...(openTypeFeatures ? { openTypeFeatures } : {}),
    ...(familyName ? { fontInfo: { familyName, customData: {} } } : {}),
    lineMetricsHorizontalLayout: buildLineMetrics(defaultMaster),
  }
}
