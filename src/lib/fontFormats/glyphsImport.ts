import type { GlyphsDocument } from 'src/lib/fontFormats/glyphsDocument'
import type {
  FontAxes,
  FontAxis,
  FontData,
  FontSource,
  GlyphComponentRef,
  GlyphData,
  GlyphLayerData,
  GlyphMetrics,
  PathData,
  PathNode,
  PathSegmentType,
} from 'src/store'
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
  smooth: boolean
): PathNode => ({
  id: `n${index}`,
  x,
  y,
  kind: 'oncurve',
  segmentType,
  smooth,
})

const createOffCurveNode = (index: number, x: number, y: number): PathNode => ({
  id: `n${index}`,
  x,
  y,
  kind: 'offcurve',
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
  if (keyword === 'OFFCURVE') {
    return createOffCurveNode(index, x, y)
  }
  const segmentType =
    keyword === 'QCURVE' ? 'quadratic' : keyword === 'CURVE' ? 'cubic' : 'line'
  return createOnCurveNode(index, x, y, segmentType, smooth)
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
  if (code.startsWith('o')) {
    return createOffCurveNode(index, x, y)
  }
  const segmentType = code.startsWith('q')
    ? 'quadratic'
    : code.startsWith('c')
      ? 'cubic'
      : 'line'
  return createOnCurveNode(index, x, y, segmentType, code.endsWith('s'))
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

const componentFromMatrix = (
  name: string,
  matrix: number[],
  index: number
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
      id: `a${index}`,
      name: asString(anchor.name) ?? `anchor${index}`,
      x: point?.x ?? 0,
      y: point?.y ?? 0,
    }
  })

const parseGuidelines = (layer: Raw): GlyphLayerData['guidelines'] =>
  asArray(layer.guides ?? layer.guideLines).map((entry, index) => {
    const guide = asRecord(entry)
    const point = parsePoint(guide.pos ?? guide.position)
    const x = point?.x ?? 0
    const y = point?.y ?? 0
    return {
      id: `g${index}`,
      x,
      y,
      angle: asNumber(guide.angle),
      locked: guide.locked === 1 || guide.locked === true,
      ...(asString(guide.name) ? { name: asString(guide.name)! } : {}),
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
      id: `p${pathIndex}`,
      closed:
        path.closed === 1 || path.closed === true || path.closed === undefined,
      nodes,
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
        ? componentFromMatrix(name, transform, index)
        : componentFromMatrix(name, [1, 0, 0, 1, 0, 0], index)
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
          componentRefs.push(componentFromMatrix(ref, transform, index))
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
        id: `p${index}`,
        closed:
          shape.closed === 1 ||
          shape.closed === true ||
          shape.closed === undefined,
        nodes,
      })
    })
  } else {
    // Glyphs 2: separate `paths` and `components` arrays.
    asArray(layer.paths).forEach(pushG2Path)
    asArray(layer.components).forEach(pushG2Component)
  }

  return {
    paths,
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
  // parseOpenStep coerces an unquoted all-digit hex code (e.g. `0041`) to a
  // number, dropping leading zeros; reconstruct the 4+ digit hex string. Codes
  // containing A–F stay strings, so only the numeric case needs padding.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeUnicodeHex(String(value))
  }
  const raw = asString(value)
  if (!raw) {
    return null
  }
  // Glyphs 3 may store a comma-separated list; keep the first code point.
  const first = raw.split(',')[0]?.trim()
  return normalizeUnicodeHex(first)
}

const displayName = (unicode: string | null, glyphName: string): string => {
  if (!unicode) {
    return glyphName
  }
  const codePoint = Number.parseInt(unicode, 16)
  if (!Number.isFinite(codePoint)) {
    return glyphName
  }
  try {
    return String.fromCodePoint(codePoint)
  } catch {
    return glyphName
  }
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
      type: 'master' | 'backup'
      associatedMasterId: string | null
      content: ParsedLayerContent
    }>
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
      const content = parseLayerContent(rawLayer)
      // A master layer is keyed by its master id so getGlyphLayer(glyph, masterId)
      // and the store's master switcher resolve it; backup layers keep their own id.
      layers.push({
        key: layerId,
        name: asString(rawLayer.name) ?? layerId,
        type: isMaster ? 'master' : 'backup',
        associatedMasterId: associated,
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
        paths: layer.content.paths,
        componentRefs: layer.content.componentRefs,
        anchors: layer.content.anchors,
        guidelines: layer.content.guidelines,
        metrics: buildMetrics(layer.content, bounds),
      }
      layerOrder.push(layer.key)
    }

    const activeLayerId =
      defaultMasterId && layers[defaultMasterId]
        ? defaultMasterId
        : (layerOrder[0] ?? null)

    glyphs[parsed.glyphName] = {
      id: parsed.glyphName,
      name: displayName(parsed.unicode, parsed.glyphName),
      activeLayerId,
      layerOrder,
      layers,
      unicode: parsed.unicode,
      production: parsed.production,
      category: parsed.category,
      subCategory: parsed.subCategory,
      export: parsed.exportFlag,
    }
    glyphOrder.push(parsed.glyphName)
  }

  const familyName = asString((document as Raw).familyName)
  const unitsPerEm = asNumber((document as Raw).unitsPerEm, 1000)
  const defaultMaster = masterEntries[0]?.master

  return {
    glyphs,
    glyphOrder,
    axes,
    sources,
    unitsPerEm,
    ...(familyName ? { fontInfo: { familyName, customData: {} } } : {}),
    lineMetricsHorizontalLayout: buildLineMetrics(defaultMaster),
  }
}
