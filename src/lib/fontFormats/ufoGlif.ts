import type { GlyphMetrics, PathData, PathNode } from '@/domain'
// From the defining module, not the src/store barrel: the barrel creates the
// zustand store and pulls every action — including paper.js — into any bundle
// that touches it, which is how a worker ended up shipping the path-boolean
// library.
import {
  getNodeSegmentType,
  getNodeType,
  isOffCurveNode,
} from '@/domain/glyphGeometry'
import { hashString } from '@/lib/hash'
import { normalizeUnicodeHex } from '@/lib/project/unicode'
import { parseUfoColor, serializeUfoColor } from '@/lib/color/kumikoColor'
import {
  childrenNamed,
  firstChildNamed,
  parseXmlTree,
  type XmlNode,
} from '@/lib/fontFormats/xmlTree'
import {
  closeSelfClosing,
  detectGlifFileStyle,
  resolveUfoTextStyle,
  xmlDeclaration,
  type UfoTextStyle,
} from '@/lib/fontFormats/ufoTextStyle'
import {
  escapeXml,
  escapeXmlText,
  parseNumeric,
  parsePlistElement,
  serializePlistValue,
} from '@/lib/fontFormats/ufoPlist'
import type {
  UfoGlyphAdvance,
  UfoGlyphAnchor,
  UfoGlyphComponent,
  UfoGlyphContour,
  UfoGlyphGuideline,
  UfoGlyphRecord,
} from '@/lib/fontFormats/ufoTypes'

const inferOffcurveType = (
  points: Array<{
    x: number
    y: number
    type?: 'move' | 'line' | 'offcurve' | 'curve' | 'qcurve'
    smooth?: boolean
    name?: string | null
    color?: string | null
    identifier?: string | null
  }>
) => {
  const normalized = points.map((point) => ({ ...point }))
  for (let index = 0; index < normalized.length; index += 1) {
    const point = normalized[index]
    if (point.type && point.type !== 'offcurve') {
      continue
    }

    let cursor = index
    while (
      cursor < normalized.length &&
      (!normalized[cursor]?.type || normalized[cursor]?.type === 'offcurve')
    ) {
      cursor += 1
    }

    while (
      index < normalized.length &&
      (!normalized[index]?.type || normalized[index]?.type === 'offcurve')
    ) {
      normalized[index]!.type = 'offcurve'
      index += 1
    }
    index -= 1
  }

  return normalized
}

export const parseGlifText = (
  text: string,
  fileName: string
): Omit<
  UfoGlyphRecord,
  'projectId' | 'ufoId' | 'layerId' | 'dirty' | 'dirtyIndex' | 'updatedAt'
> => {
  const glyphElement = parseXmlTree(text, fileName)
  if (glyphElement.tag !== 'glyph') {
    throw new Error(`Invalid GLIF: ${fileName}`)
  }
  const glifStyle = detectGlifFileStyle(text)
  // Attributes the format leaves optional are only emitted back when the source
  // had them, so absence has to stay distinguishable from a default.
  const optional = (
    node: XmlNode,
    name: string,
    fallback: number
  ): Record<string, number> =>
    node.attrs[name] === undefined
      ? {}
      : { [name]: parseNumeric(node.attrs[name]) ?? fallback }

  const unicodes = childrenNamed(glyphElement, 'unicode')
    .map((node) => normalizeUnicodeHex(node.attrs.hex))
    .filter((value): value is string => Boolean(value))

  const advanceElement = firstChildNamed(glyphElement, 'advance')
  const advance: UfoGlyphAdvance = {
    width: parseNumeric(advanceElement?.attrs.width) ?? null,
    height: parseNumeric(advanceElement?.attrs.height) ?? null,
  }

  const anchors: UfoGlyphAnchor[] = childrenNamed(glyphElement, 'anchor').map(
    (anchor) => ({
      x: parseNumeric(anchor.attrs.x) ?? 0,
      y: parseNumeric(anchor.attrs.y) ?? 0,
      name: anchor.attrs.name ?? '',
      color: anchor.attrs.color ?? null,
      identifier: anchor.attrs.identifier ?? null,
    })
  )

  const guidelines: UfoGlyphGuideline[] = childrenNamed(
    glyphElement,
    'guideline'
  ).map((guide) => ({
    x: parseNumeric(guide.attrs.x),
    y: parseNumeric(guide.attrs.y),
    angle: parseNumeric(guide.attrs.angle),
    name: guide.attrs.name ?? null,
    color: guide.attrs.color ?? null,
    identifier: guide.attrs.identifier ?? null,
  }))

  const outlineElement = firstChildNamed(glyphElement, 'outline')
  const contours: UfoGlyphContour[] = childrenNamed(
    outlineElement,
    'contour'
  ).map((contour) => ({
    identifier: contour.attrs.identifier ?? null,
    points: inferOffcurveType(
      childrenNamed(contour, 'point').map((point) => ({
        x: parseNumeric(point.attrs.x) ?? 0,
        y: parseNumeric(point.attrs.y) ?? 0,
        type:
          (point.attrs.type as
            | 'move'
            | 'line'
            | 'offcurve'
            | 'curve'
            | 'qcurve'
            | undefined) ?? undefined,
        smooth: point.attrs.smooth === 'yes',
        name: point.attrs.name ?? null,
        color: point.attrs.color ?? null,
        identifier: point.attrs.identifier ?? null,
      }))
    ),
  }))

  const components: UfoGlyphComponent[] = childrenNamed(
    outlineElement,
    'component'
  ).map((component) => ({
    base: component.attrs.base ?? '',
    ...(component.attrs.identifier === undefined
      ? {}
      : { identifier: component.attrs.identifier }),
    ...optional(component, 'xScale', 1),
    ...optional(component, 'xyScale', 0),
    ...optional(component, 'yxScale', 0),
    ...optional(component, 'yScale', 1),
    ...optional(component, 'xOffset', 0),
    ...optional(component, 'yOffset', 0),
  }))

  const noteElement = firstChildNamed(glyphElement, 'note')
  const note = noteElement ? noteElement.text : null
  const imageElement = firstChildNamed(glyphElement, 'image')
  const image = imageElement
    ? {
        fileName: imageElement.attrs.fileName ?? '',
        ...optional(imageElement, 'xScale', 1),
        ...optional(imageElement, 'xyScale', 0),
        ...optional(imageElement, 'yxScale', 0),
        ...optional(imageElement, 'yScale', 1),
        ...optional(imageElement, 'xOffset', 0),
        ...optional(imageElement, 'yOffset', 0),
        ...(imageElement.attrs.color === undefined
          ? {}
          : { color: imageElement.attrs.color }),
      }
    : null

  const libElement = firstChildNamed(
    firstChildNamed(glyphElement, 'lib'),
    'dict'
  )
  const lib = libElement
    ? (parsePlistElement(libElement) as Record<string, unknown>)
    : null

  return {
    glyphName: glyphElement.attrs.name ?? fileName.replace(/\.glif$/i, ''),
    fileName,
    sourceHash: hashString(text),
    unicodes,
    advance,
    anchors,
    guidelines,
    contours,
    components,
    note,
    image,
    lib,
    glifStyle,
  }
}

const buildPathNodesFromContour = (contour: UfoGlyphContour): PathNode[] =>
  contour.points.map((point, index) => ({
    id: point.identifier ?? `n${index}`,
    identifier: point.identifier,
    name: point.name,
    color: parseUfoColor(point.color),
    x: point.x,
    y: point.y,
    ...(point.type === undefined || point.type === 'offcurve'
      ? { kind: 'offcurve' as const }
      : {
          kind: 'oncurve' as const,
          segmentType:
            point.type === 'qcurve'
              ? ('quadratic' as const)
              : point.type === 'curve'
                ? ('cubic' as const)
                : ('line' as const),
          smooth: point.smooth,
        }),
  }))

const isOpenContour = (contour: UfoGlyphContour) =>
  contour.points[0]?.type === 'move'

// Node order is written out as it stands. A closed contour has no canonical
// starting point — UFO lets one begin with off-curve points, and both fontTools
// and Glyphs write them that way — so rotating to the first on-curve point on
// export rewrote every such contour and showed up as a change in 12,600 files.
export const pathToUfoContour = (path: PathData): UfoGlyphContour => {
  const orderedNodes = path.nodes

  return {
    identifier: path.identifier,
    points: orderedNodes.map((node, index) => {
      if (isOffCurveNode(node)) {
        return {
          x: node.x,
          y: node.y,
          name: node.name,
          identifier: node.identifier,
          color: serializeUfoColor(node.color),
        }
      }

      const pointType =
        !path.closed && index === 0
          ? 'move'
          : getNodeSegmentType(node) === 'quadratic'
            ? 'qcurve'
            : getNodeSegmentType(node) === 'cubic'
              ? 'curve'
              : 'line'

      return {
        x: node.x,
        y: node.y,
        type: pointType,
        smooth: getNodeType(node) === 'smooth',
        name: node.name,
        identifier: node.identifier,
        color: serializeUfoColor(node.color),
      }
    }),
  }
}

export interface GlyphBounds {
  xMin: number
  xMax: number
}

const getContourBounds = (contour: UfoGlyphContour): GlyphBounds | null => {
  const relevantPoints = contour.points.filter(
    (point) => point.type !== 'move' || contour.points.length === 1
  )
  if (relevantPoints.length === 0) {
    return null
  }

  let xMin = Infinity
  let xMax = -Infinity
  for (const point of relevantPoints) {
    xMin = Math.min(xMin, point.x)
    xMax = Math.max(xMax, point.x)
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    return null
  }

  return { xMin, xMax }
}

const transformBounds = (
  bounds: GlyphBounds,
  component: UfoGlyphComponent
): GlyphBounds => {
  const xScale = component.xScale ?? 1
  const yxScale = component.yxScale ?? 0
  const xOffset = component.xOffset ?? 0

  const candidates = [
    bounds.xMin * xScale + xOffset,
    bounds.xMax * xScale + xOffset,
    bounds.xMin * yxScale + xOffset,
    bounds.xMax * yxScale + xOffset,
  ]

  return {
    xMin: Math.min(...candidates),
    xMax: Math.max(...candidates),
  }
}

const unionBounds = (
  boundsList: Array<GlyphBounds | null>
): GlyphBounds | null => {
  const validBounds = boundsList.filter((bounds): bounds is GlyphBounds =>
    Boolean(bounds)
  )
  if (validBounds.length === 0) {
    return null
  }

  return {
    xMin: Math.min(...validBounds.map((bounds) => bounds.xMin)),
    xMax: Math.max(...validBounds.map((bounds) => bounds.xMax)),
  }
}

export const buildBoundsResolver = (glyphRecords: UfoGlyphRecord[]) => {
  const recordMap = new Map(
    glyphRecords.map((record) => [record.glyphName, record])
  )
  const cache = new Map<string, GlyphBounds | null>()
  const resolving = new Set<string>()

  const resolve = (glyphName: string): GlyphBounds | null => {
    if (cache.has(glyphName)) {
      return cache.get(glyphName) ?? null
    }
    if (resolving.has(glyphName)) {
      return null
    }

    const record = recordMap.get(glyphName)
    if (!record) {
      return null
    }

    resolving.add(glyphName)
    const contourBounds = unionBounds(record.contours.map(getContourBounds))
    const componentBounds = unionBounds(
      record.components.map((component) => {
        const baseBounds = resolve(component.base)
        return baseBounds ? transformBounds(baseBounds, component) : null
      })
    )
    const resolvedBounds = unionBounds([contourBounds, componentBounds])
    resolving.delete(glyphName)
    cache.set(glyphName, resolvedBounds)
    return resolvedBounds
  }

  return resolve
}

// Build the interpolatable content (outline + metrics) of one glyph layer from
// its UFO record. Shared by the master layer and backup layers.
export const glyphRecordToLayerContent = (
  record: UfoGlyphRecord,
  resolveBounds: (glyphName: string) => GlyphBounds | null
) => {
  const width = record.advance.width ?? 0
  const bounds = resolveBounds(record.glyphName)
  const lsb = Math.round(bounds?.xMin ?? 0)
  const metrics: GlyphMetrics = {
    width,
    lsb,
    rsb: Math.round(bounds ? width - bounds.xMax : width - lsb),
  }
  return {
    // The vertical advance CJK sources carry. Nothing else read it out of the
    // record, so importing a vertical font dropped it and writing the glyph back
    // lost the attribute.
    ...(record.advance.height !== null && record.advance.height !== undefined
      ? { verticalMetrics: { height: record.advance.height } }
      : {}),
    paths: record.contours.map((contour, index) => ({
      id: `p${index}`,
      // Kept apart from the internal id, like every other element's: an absent
      // identifier must stay absent when the glyph is written back.
      identifier: contour.identifier,
      closed: !isOpenContour(contour),
      nodes: buildPathNodesFromContour(contour),
    })),
    components: record.components.map((component) => component.base),
    componentRefs: record.components.map((component, index) => ({
      id: component.identifier ?? `c${index}`,
      // Kept apart from the internal id: an absent identifier must stay absent,
      // or writing the glyph back invents one the source never had.
      identifier: component.identifier,
      glyphId: component.base,
      x: component.xOffset ?? 0,
      y: component.yOffset ?? 0,
      scaleX: component.xScale ?? 1,
      scaleY: component.yScale ?? 1,
      xyScale: component.xyScale ?? 0,
      yxScale: component.yxScale ?? 0,
      rotation: 0,
    })),
    anchors: record.anchors.map((anchor, index) => ({
      id: anchor.identifier ?? `a${index}`,
      identifier: anchor.identifier,
      name: anchor.name,
      x: anchor.x,
      y: anchor.y,
      color: parseUfoColor(anchor.color),
    })),
    guidelines: record.guidelines.map((guide, index) => ({
      id: guide.identifier ?? `g${index}`,
      identifier: guide.identifier,
      x: guide.x ?? 0,
      y: guide.y ?? 0,
      angle: guide.angle ?? 0,
      locked: false,
      name: guide.name ?? undefined,
      color: parseUfoColor(guide.color),
    })),
    metrics,
  }
}

export const serializeGlifRecord = (
  record: UfoGlyphRecord,
  textStyle?: Partial<UfoTextStyle> | null
) => {
  const style = resolveUfoTextStyle(
    typeof record.glifStyle?.selfClosingSpace === 'boolean'
      ? { ...textStyle, selfClosingSpace: record.glifStyle.selfClosingSpace }
      : textStyle
  )
  const close = closeSelfClosing(style)
  const tag = (indent: string, name: string, attrs: string[]) =>
    `${indent}<${name} ${attrs.join(' ')}${close}`

  const contourXml = record.contours
    .map(
      (contour) => `    <contour${
        contour.identifier
          ? ` identifier="${escapeXml(contour.identifier)}"`
          : ''
      }>
${contour.points
  .map((point) => {
    const attrs = [
      `x="${point.x}"`,
      `y="${point.y}"`,
      // offcurve is the format's default and no producer writes it out
      ...(point.type && point.type !== 'offcurve'
        ? [`type="${point.type}"`]
        : []),
      ...(point.smooth ? ['smooth="yes"'] : []),
      ...(point.name ? [`name="${escapeXml(point.name)}"`] : []),
      ...(point.color ? [`color="${escapeXml(point.color)}"`] : []),
      ...(point.identifier
        ? [`identifier="${escapeXml(point.identifier)}"`]
        : []),
    ]
    return tag('      ', 'point', attrs)
  })
  .join('\n')}
    </contour>`
    )
    .join('\n')

  const componentXml = record.components
    .map((component) =>
      tag('    ', 'component', [
        `base="${escapeXml(component.base)}"`,
        ...(component.xScale !== undefined
          ? [`xScale="${component.xScale}"`]
          : []),
        ...(component.xyScale !== undefined
          ? [`xyScale="${component.xyScale}"`]
          : []),
        ...(component.yxScale !== undefined
          ? [`yxScale="${component.yxScale}"`]
          : []),
        ...(component.yScale !== undefined
          ? [`yScale="${component.yScale}"`]
          : []),
        ...(component.xOffset !== undefined
          ? [`xOffset="${component.xOffset}"`]
          : []),
        ...(component.yOffset !== undefined
          ? [`yOffset="${component.yOffset}"`]
          : []),
        ...(component.identifier
          ? [`identifier="${escapeXml(component.identifier)}"`]
          : []),
      ])
    )
    .join('\n')

  const outlineChildren = [contourXml, componentXml].filter(Boolean).join('\n')

  // Absent sections contribute nothing: an empty line here would show up as a
  // change in every file that has no note, image or guidelines.
  const body: string[] = []
  if (record.advance.width !== null || record.advance.height !== null) {
    body.push(
      tag('  ', 'advance', [
        ...(record.advance.width !== null
          ? [`width="${record.advance.width}"`]
          : []),
        // vertical advance: CJK sources carry it and dropping it loses data
        ...(record.advance.height !== null
          ? [`height="${record.advance.height}"`]
          : []),
      ])
    )
  }
  for (const unicode of record.unicodes) {
    body.push(tag('  ', 'unicode', [`hex="${unicode}"`]))
  }
  if (record.note) {
    body.push(`  <note>${escapeXmlText(record.note)}</note>`)
  }
  if (record.image) {
    body.push(
      tag('  ', 'image', [
        `fileName="${escapeXml(record.image.fileName)}"`,
        ...(record.image.xScale !== undefined
          ? [`xScale="${record.image.xScale}"`]
          : []),
        ...(record.image.xyScale !== undefined
          ? [`xyScale="${record.image.xyScale}"`]
          : []),
        ...(record.image.yxScale !== undefined
          ? [`yxScale="${record.image.yxScale}"`]
          : []),
        ...(record.image.yScale !== undefined
          ? [`yScale="${record.image.yScale}"`]
          : []),
        ...(record.image.xOffset !== undefined
          ? [`xOffset="${record.image.xOffset}"`]
          : []),
        ...(record.image.yOffset !== undefined
          ? [`yOffset="${record.image.yOffset}"`]
          : []),
        ...(record.image.color
          ? [`color="${escapeXml(record.image.color)}"`]
          : []),
      ])
    )
  }
  for (const guide of record.guidelines) {
    body.push(
      tag('  ', 'guideline', [
        ...(guide.x !== null && guide.x !== undefined
          ? [`x="${guide.x}"`]
          : []),
        ...(guide.y !== null && guide.y !== undefined
          ? [`y="${guide.y}"`]
          : []),
        ...(guide.angle !== null && guide.angle !== undefined
          ? [`angle="${guide.angle}"`]
          : []),
        ...(guide.name ? [`name="${escapeXml(guide.name)}"`] : []),
        ...(guide.color ? [`color="${escapeXml(guide.color)}"`] : []),
        ...(guide.identifier
          ? [`identifier="${escapeXml(guide.identifier)}"`]
          : []),
      ])
    )
  }
  for (const anchor of record.anchors) {
    body.push(
      tag('  ', 'anchor', [
        `x="${anchor.x}"`,
        `y="${anchor.y}"`,
        `name="${escapeXml(anchor.name)}"`,
        ...(anchor.color ? [`color="${escapeXml(anchor.color)}"`] : []),
        ...(anchor.identifier
          ? [`identifier="${escapeXml(anchor.identifier)}"`]
          : []),
      ])
    )
  }
  // The outline element is always written, empty or not: that is what both
  // fontTools and Glyphs do, and omitting it is a diff in every blank glyph.
  if (outlineChildren) {
    body.push(`  <outline>`, outlineChildren, `  </outline>`)
  } else if (record.glifStyle?.emptyOutlineElement !== false) {
    body.push(`  <outline>`, `  </outline>`)
  }
  if (record.lib) {
    // A glif's embedded lib is always two-space indented, even in sources whose
    // .plist files use tabs.
    body.push(
      `  <lib>`,
      serializePlistValue(record.lib, 2, { ...style, plistIndent: '  ' }),
      `  </lib>`
    )
  }

  return `${xmlDeclaration(style)}
<glyph name="${escapeXml(record.glyphName)}" format="2">
${body.join('\n')}
</glyph>
`
}
