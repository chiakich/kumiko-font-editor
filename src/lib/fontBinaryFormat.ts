import opentype from 'opentype.js'
import type { FontData, GlyphData, PathData, PathNode } from '../store'
import type { ProjectSourceFormat } from './projectFormats'

const DEFAULT_LAYER_ID = 'public.default'

const toUnicodeString = (unicode: number | undefined) => {
  if (unicode === undefined) return null
  return unicode.toString(16).toUpperCase().padStart(4, '0')
}

const createNode = (x: number, y: number, type: PathNode['type'], idx: number): PathNode => ({
  id: `node-${idx}-${Math.random().toString(36).slice(2, 8)}`,
  x,
  y,
  type,
})

const toGlyphId = (glyph: opentype.Glyph, idx: number) => {
  if (glyph.name) return glyph.name
  if (glyph.unicode !== undefined) return `uni${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}`
  return `glyph-${idx}`
}

const contourToPath = (commands: opentype.PathCommand[], contourIndex: number): PathData | null => {
  const nodes: PathNode[] = []
  let closed = false
  commands.forEach((cmd, index) => {
    if (cmd.type === 'Z') {
      closed = true
      return
    }
    if (cmd.type === 'M' || cmd.type === 'L') {
      nodes.push(createNode(cmd.x ?? 0, cmd.y ?? 0, 'corner', contourIndex * 10000 + index))
      return
    }
    if (cmd.type === 'Q') {
      nodes.push(createNode(cmd.x1 ?? 0, cmd.y1 ?? 0, 'offcurve', contourIndex * 10000 + index * 2))
      nodes.push(createNode(cmd.x ?? 0, cmd.y ?? 0, 'qcurve', contourIndex * 10000 + index * 2 + 1))
      return
    }
    if (cmd.type === 'C') {
      nodes.push(createNode(cmd.x1 ?? 0, cmd.y1 ?? 0, 'offcurve', contourIndex * 10000 + index * 3))
      nodes.push(createNode(cmd.x2 ?? 0, cmd.y2 ?? 0, 'offcurve', contourIndex * 10000 + index * 3 + 1))
      nodes.push(createNode(cmd.x ?? 0, cmd.y ?? 0, 'corner', contourIndex * 10000 + index * 3 + 2))
    }
  })

  if (nodes.length === 0) return null
  return { id: `path-${contourIndex}`, nodes, closed }
}

export const importBinaryFontFile = async (file: File) => {
  const buffer = await file.arrayBuffer()
  const font = opentype.parse(buffer)
  const glyphs: Record<string, GlyphData> = {}

  for (let idx = 0; idx < font.glyphs.length; idx += 1) {
    const glyph = font.glyphs.get(idx)
    const commands = glyph.path.commands
    const contours: opentype.PathCommand[][] = []
    let current: opentype.PathCommand[] = []
    for (const cmd of commands) {
      if (cmd.type === 'M' && current.length > 0) {
        contours.push(current)
        current = [cmd]
      } else {
        current.push(cmd)
      }
    }
    if (current.length > 0) contours.push(current)

    const paths = contours
      .map((contour, contourIndex) => contourToPath(contour, contourIndex))
      .filter((path): path is PathData => Boolean(path))

    const width = glyph.advanceWidth ?? font.unitsPerEm
    const glyphId = toGlyphId(glyph, idx)
    glyphs[glyphId] = {
      id: glyphId,
      name: glyph.name ?? glyphId,
      unicode: toUnicodeString(glyph.unicode),
      metrics: { lsb: glyph.leftSideBearing ?? 0, rsb: 0, width },
      paths,
      components: [],
      componentRefs: [],
      layers: {
        [DEFAULT_LAYER_ID]: {
          id: DEFAULT_LAYER_ID,
          name: 'Default',
          paths,
          components: [],
          componentRefs: [],
          anchors: [],
          guidelines: [],
          metrics: { lsb: glyph.leftSideBearing ?? 0, rsb: 0, width },
        },
      },
      layerOrder: [DEFAULT_LAYER_ID],
    }

    if (idx > 5000) break
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  const sourceFormat: ProjectSourceFormat =
    ext === 'ttf' ? 'ttf' : ext === 'otf' || ext === 'oft' ? 'otf' : 'woff'

  return {
    projectId: `font-${Date.now()}`,
    projectTitle: file.name.replace(/\.[^.]+$/, ''),
    fontData: { glyphs } as FontData,
    sourceFormat,
  }
}


const appendShapeToPath = (path: opentype.Path, shape: PathData) => {
  if (shape.nodes.length === 0) return

  const nodes = shape.nodes
  const first = nodes[0]
  path.moveTo(first.x, first.y)

  let i = 1
  while (i < nodes.length) {
    const node = nodes[i]

    if (node.type === 'offcurve') {
      const next = nodes[i + 1]
      if (next?.type === 'offcurve') {
        const end = nodes[i + 2]
        if (end) {
          path.curveTo(node.x, node.y, next.x, next.y, end.x, end.y)
          i += 3
          continue
        }
      }

      if (next) {
        path.quadraticCurveTo(node.x, node.y, next.x, next.y)
        i += 2
        continue
      }

      path.lineTo(node.x, node.y)
      i += 1
      continue
    }

    path.lineTo(node.x, node.y)
    i += 1
  }

  if (shape.closed) path.close()
}

export const exportFontAsBinary = (fontData: FontData, format: 'ttf' | 'otf' | 'woff') => {
  const glyphList = Object.values(fontData.glyphs)
  const glyphs = glyphList.map((glyph) => {
    const path = new opentype.Path()
    glyph.paths.forEach((shape) => {
      appendShapeToPath(path, shape)
    })
    return new opentype.Glyph({
      name: glyph.name ?? glyph.id,
      unicode: glyph.unicode ? Number.parseInt(glyph.unicode, 16) : undefined,
      advanceWidth: glyph.metrics.width,
      path,
    })
  })

  const font = new opentype.Font({
    familyName: 'KumikoExport',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  })
  const arr = font.toArrayBuffer()
  const mime = format === 'woff' ? 'font/woff' : format === 'otf' ? 'font/otf' : 'font/ttf'
  return new Blob([arr], { type: mime })
}
