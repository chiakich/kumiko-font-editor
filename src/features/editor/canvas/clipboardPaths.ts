import type { PathData, PathNode, NodeType, GlyphData } from 'src/store'

export interface ClipboardPathPayload {
  type: 'kumiko-paths'
  paths: Array<{
    closed: boolean
    nodes: Array<{
      x: number
      y: number
      type: NodeType
    }>
  }>
}

const CLIPBOARD_PREFIX = 'KUMIKO_PATHS:'

const generateId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`

export function serializeClipboardPaths(payload: ClipboardPathPayload) {
  return `${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`
}

export function parseClipboardPathsText(
  text: string
): ClipboardPathPayload | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith(CLIPBOARD_PREFIX)) {
    try {
      const parsed = JSON.parse(
        trimmed.slice(CLIPBOARD_PREFIX.length)
      ) as ClipboardPathPayload
      if (parsed?.type === 'kumiko-paths' && Array.isArray(parsed.paths)) {
        return parsed
      }
    } catch {
      return null
    }
  }

  const svgPaths = parseSvgLikePaths(trimmed)
  if (svgPaths.length > 0) {
    return {
      type: 'kumiko-paths',
      paths: svgPaths,
    }
  }

  return null
}

export function materializeClipboardPaths(
  payload: ClipboardPathPayload,
  offset = { x: 20, y: -20 }
): PathData[] {
  return payload.paths.map((path) => ({
    id: generateId('path'),
    closed: path.closed,
    nodes: path.nodes.map((node) => ({
      id: generateId('node'),
      x: Math.round(node.x + offset.x),
      y: Math.round(node.y + offset.y),
      type: node.type,
    })),
  }))
}

export function buildClipboardPayloadFromSelection(
  glyph: GlyphData,
  selectedNodeIds: string[],
  selectedSegment?: {
    pathId: string
    startNodeId: string
    endNodeId: string
  } | null
): ClipboardPathPayload | null {
  const paths: ClipboardPathPayload['paths'] = []

  if (selectedSegment) {
    const path = glyph.paths.find(
      (candidate) => candidate.id === selectedSegment.pathId
    )
    if (path) {
      const startIndex = path.nodes.findIndex(
        (node) => node.id === selectedSegment.startNodeId
      )
      const endIndex = path.nodes.findIndex(
        (node) => node.id === selectedSegment.endNodeId
      )
      if (startIndex >= 0 && endIndex >= startIndex) {
        paths.push({
          closed: false,
          nodes: path.nodes
            .slice(startIndex, endIndex + 1)
            .map(toClipboardNode),
        })
      }
    }
  }

  const selectedByPath = new Map<string, number[]>()
  for (const selectedNodeId of selectedNodeIds) {
    const [pathId, nodeId] = selectedNodeId.split(':')
    const path = glyph.paths.find((candidate) => candidate.id === pathId)
    const nodeIndex = path?.nodes.findIndex((node) => node.id === nodeId) ?? -1
    if (!pathId || nodeIndex < 0) {
      continue
    }
    const indices = selectedByPath.get(pathId) ?? []
    indices.push(nodeIndex)
    selectedByPath.set(pathId, indices)
  }

  for (const [pathId, indices] of selectedByPath) {
    const path = glyph.paths.find((candidate) => candidate.id === pathId)
    if (!path || indices.length === 0) {
      continue
    }

    const uniqueIndices = [...new Set(indices)].sort((a, b) => a - b)
    if (uniqueIndices.length === path.nodes.length) {
      paths.push({
        closed: path.closed,
        nodes: path.nodes.map(toClipboardNode),
      })
      continue
    }

    const ranges = buildContiguousRanges(uniqueIndices)
    for (const [startIndex, endIndex] of ranges) {
      const slice = path.nodes.slice(startIndex, endIndex + 1)
      if (slice.length < 2) {
        continue
      }
      paths.push({
        closed: false,
        nodes: slice.map(toClipboardNode),
      })
    }
  }

  if (!paths.length) {
    return null
  }

  return {
    type: 'kumiko-paths',
    paths: normalizePayloadBounds(paths),
  }
}

function toClipboardNode(node: PathNode) {
  return {
    x: node.x,
    y: node.y,
    type: node.type,
  }
}

function buildContiguousRanges(indices: number[]) {
  const ranges: Array<[number, number]> = []
  let rangeStart = indices[0]
  let previous = indices[0]

  for (let i = 1; i < indices.length; i += 1) {
    const current = indices[i]
    if (current === previous + 1) {
      previous = current
      continue
    }
    ranges.push([rangeStart, previous])
    rangeStart = current
    previous = current
  }

  ranges.push([rangeStart, previous])
  return ranges
}

function normalizePayloadBounds(paths: ClipboardPathPayload['paths']) {
  const bounds = getBounds(paths)
  if (!bounds) {
    return paths
  }

  return paths.map((path) => ({
    ...path,
    nodes: path.nodes.map((node) => ({
      ...node,
      x: node.x - bounds.xMin,
      y: node.y - bounds.yMin,
    })),
  }))
}

function getBounds(paths: ClipboardPathPayload['paths']) {
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity

  for (const path of paths) {
    for (const node of path.nodes) {
      xMin = Math.min(xMin, node.x)
      yMin = Math.min(yMin, node.y)
      xMax = Math.max(xMax, node.x)
      yMax = Math.max(yMax, node.y)
    }
  }

  if (!Number.isFinite(xMin) || !Number.isFinite(yMin)) {
    return null
  }

  return { xMin, yMin, xMax, yMax }
}

function parseSvgLikePaths(text: string): ClipboardPathPayload['paths'] {
  const pathEntries = extractPathStrings(text)
  return pathEntries.flatMap((entry) => {
    const paths = parseSvgPathData(entry.pathData)
    return entry.viewBoxHeight
      ? flipSvgPathsY(paths, entry.viewBoxHeight)
      : paths
  })
}

function extractPathStrings(text: string) {
  const viewBoxMatch = text.match(/<svg\b[^>]*\sviewBox=(["'])(.*?)\1/i)
  const viewBoxHeight = parseViewBoxHeight(viewBoxMatch?.[2])
  const pathMatches = [...text.matchAll(/<path\b[^>]*\sd=(["'])(.*?)\1/gi)]
  if (pathMatches.length > 0) {
    return pathMatches
      .map((match) => match[2])
      .filter(Boolean)
      .map((pathData) => ({ pathData, viewBoxHeight }))
  }

  if (/[mMlLhHvVcCsSqQtTzZ]/.test(text)) {
    return [{ pathData: text, viewBoxHeight }]
  }

  return []
}

function parseViewBoxHeight(viewBox: string | undefined) {
  if (!viewBox) {
    return null
  }

  const parts = viewBox
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value))

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null
  }

  return parts[1] + parts[3]
}

function parseSvgPathData(pathData: string): ClipboardPathPayload['paths'] {
  const tokens = [
    ...pathData.matchAll(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g),
  ].map((match) => match[0])
  const contours: ClipboardPathPayload['paths'] = []
  let index = 0
  let command = ''
  let currentX = 0
  let currentY = 0
  let startX = 0
  let startY = 0
  let lastCubicControlX: number | null = null
  let lastCubicControlY: number | null = null
  let lastQuadControlX: number | null = null
  let lastQuadControlY: number | null = null
  let currentContour: ClipboardPathPayload['paths'][number] | null = null

  const readNumber = () => Number(tokens[index++])
  const ensureContour = () => {
    if (!currentContour) {
      currentContour = { closed: false, nodes: [] }
      contours.push(currentContour)
    }
  }

  while (index < tokens.length) {
    const token = tokens[index]
    if (/^[a-zA-Z]$/.test(token)) {
      command = token
      index += 1
    }

    if (!command) {
      break
    }

    const relative = command === command.toLowerCase()
    const normalized = command.toUpperCase()

    if (normalized === 'M') {
      const x = readNumber()
      const y = readNumber()
      currentX = relative ? currentX + x : x
      currentY = relative ? currentY + y : y
      startX = currentX
      startY = currentY
      currentContour = {
        closed: false,
        nodes: [{ x: currentX, y: currentY, type: 'corner' }],
      }
      contours.push(currentContour)
      command = relative ? 'l' : 'L'
      lastCubicControlX = null
      lastCubicControlY = null
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    ensureContour()

    if (normalized === 'L') {
      const x = readNumber()
      const y = readNumber()
      currentX = relative ? currentX + x : x
      currentY = relative ? currentY + y : y
      currentContour!.nodes.push({ x: currentX, y: currentY, type: 'corner' })
      lastCubicControlX = null
      lastCubicControlY = null
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    if (normalized === 'H') {
      const x = readNumber()
      currentX = relative ? currentX + x : x
      currentContour!.nodes.push({ x: currentX, y: currentY, type: 'corner' })
      lastCubicControlX = null
      lastCubicControlY = null
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    if (normalized === 'V') {
      const y = readNumber()
      currentY = relative ? currentY + y : y
      currentContour!.nodes.push({ x: currentX, y: currentY, type: 'corner' })
      lastCubicControlX = null
      lastCubicControlY = null
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    if (normalized === 'C') {
      const x1 = readNumber()
      const y1 = readNumber()
      const x2 = readNumber()
      const y2 = readNumber()
      const x = readNumber()
      const y = readNumber()
      const handle1X = relative ? currentX + x1 : x1
      const handle1Y = relative ? currentY + y1 : y1
      const handle2X = relative ? currentX + x2 : x2
      const handle2Y = relative ? currentY + y2 : y2
      currentX = relative ? currentX + x : x
      currentY = relative ? currentY + y : y
      currentContour!.nodes.push(
        { x: handle1X, y: handle1Y, type: 'offcurve' },
        { x: handle2X, y: handle2Y, type: 'offcurve' },
        { x: currentX, y: currentY, type: 'smooth' }
      )
      lastCubicControlX = handle2X
      lastCubicControlY = handle2Y
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    if (normalized === 'S') {
      const x2 = readNumber()
      const y2 = readNumber()
      const x = readNumber()
      const y = readNumber()
      const handle1X =
        lastCubicControlX === null ? currentX : currentX * 2 - lastCubicControlX
      const handle1Y =
        lastCubicControlY === null ? currentY : currentY * 2 - lastCubicControlY
      const handle2X = relative ? currentX + x2 : x2
      const handle2Y = relative ? currentY + y2 : y2
      currentX = relative ? currentX + x : x
      currentY = relative ? currentY + y : y
      currentContour!.nodes.push(
        { x: handle1X, y: handle1Y, type: 'offcurve' },
        { x: handle2X, y: handle2Y, type: 'offcurve' },
        { x: currentX, y: currentY, type: 'smooth' }
      )
      lastCubicControlX = handle2X
      lastCubicControlY = handle2Y
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    if (normalized === 'Q') {
      const x1 = readNumber()
      const y1 = readNumber()
      const x = readNumber()
      const y = readNumber()
      const handleX = relative ? currentX + x1 : x1
      const handleY = relative ? currentY + y1 : y1
      currentX = relative ? currentX + x : x
      currentY = relative ? currentY + y : y
      currentContour!.nodes.push(
        { x: handleX, y: handleY, type: 'qcurve' },
        { x: currentX, y: currentY, type: 'smooth' }
      )
      lastQuadControlX = handleX
      lastQuadControlY = handleY
      lastCubicControlX = null
      lastCubicControlY = null
      continue
    }

    if (normalized === 'T') {
      const x = readNumber()
      const y = readNumber()
      const handleX: number =
        lastQuadControlX === null ? currentX : currentX * 2 - lastQuadControlX
      const handleY: number =
        lastQuadControlY === null ? currentY : currentY * 2 - lastQuadControlY
      currentX = relative ? currentX + x : x
      currentY = relative ? currentY + y : y
      currentContour!.nodes.push(
        { x: handleX, y: handleY, type: 'qcurve' },
        { x: currentX, y: currentY, type: 'smooth' }
      )
      lastQuadControlX = handleX
      lastQuadControlY = handleY
      lastCubicControlX = null
      lastCubicControlY = null
      continue
    }

    if (normalized === 'Z') {
      currentContour!.closed = true
      currentX = startX
      currentY = startY
      currentContour = null
      command = ''
      lastCubicControlX = null
      lastCubicControlY = null
      lastQuadControlX = null
      lastQuadControlY = null
      continue
    }

    break
  }

  return contours.filter((contour) => contour.nodes.length > 0)
}

function flipSvgPathsY(
  paths: ClipboardPathPayload['paths'],
  viewBoxHeight: number
) {
  return paths.map((path) => ({
    ...path,
    nodes: path.nodes.map((node) => ({
      ...node,
      y: viewBoxHeight - node.y,
    })),
  }))
}
