import type opentype from 'opentype.js'
import {
  isHanCodePoint,
  type StructureBodyBox,
} from 'src/lib/qualityCheck/hanClassification'
import {
  flattenContour,
  getPolygonsBounds,
  type GeometryPoint,
} from 'src/lib/qualityCheck/polygonGeometry'
import { computeInkFromPolygons } from 'src/lib/qualityCheck/glyphInk'
import { buildSidesFromPolygons } from 'src/lib/qualityCheck/structureMetrics'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'

/**
 * 把 opentype.js 解析出的字體轉成與編輯器相同的 GlyphGeometrySample，
 * 讓離線校正（test_glyphs 的優質字體）與參考資料建置走同一條
 * 幾何管線，量測結果才能代表 production radar 的行為。
 */

const DEFAULT_ASCENDER_RATIO = 0.88

type FlattenNodes = Parameters<typeof flattenContour>[0]

const commandContours = (commands: opentype.PathCommand[]) => {
  const contours: opentype.PathCommand[][] = []
  let current: opentype.PathCommand[] = []
  for (const command of commands) {
    if (command.type === 'M' && current.length > 0) {
      contours.push(current)
      current = [command]
    } else {
      current.push(command)
    }
  }
  if (current.length > 0) {
    contours.push(current)
  }
  return contours
}

const contourToFlattenNodes = (
  commands: opentype.PathCommand[]
): FlattenNodes | null => {
  const nodes: FlattenNodes = []
  let closed = false
  for (const command of commands) {
    if (command.type === 'Z') {
      closed = true
    } else if (command.type === 'M' || command.type === 'L') {
      nodes.push({
        x: command.x ?? 0,
        y: command.y ?? 0,
        kind: 'oncurve',
        segmentType: 'line',
      })
    } else if (command.type === 'Q') {
      nodes.push({ x: command.x1 ?? 0, y: command.y1 ?? 0, kind: 'offcurve' })
      nodes.push({
        x: command.x ?? 0,
        y: command.y ?? 0,
        kind: 'oncurve',
        segmentType: 'quadratic',
      })
    } else if (command.type === 'C') {
      nodes.push({ x: command.x1 ?? 0, y: command.y1 ?? 0, kind: 'offcurve' })
      nodes.push({ x: command.x2 ?? 0, y: command.y2 ?? 0, kind: 'offcurve' })
      nodes.push({
        x: command.x ?? 0,
        y: command.y ?? 0,
        kind: 'oncurve',
        segmentType: 'cubic',
      })
    }
  }
  return closed && nodes.length >= 3 ? nodes : null
}

export const openTypePathToPolygons = (
  commands: opentype.PathCommand[]
): GeometryPoint[][] =>
  commandContours(commands)
    .map(contourToFlattenNodes)
    .filter((nodes): nodes is FlattenNodes => Boolean(nodes))
    .map(flattenContour)
    .filter((polygon) => polygon.length >= 3)

export const getOpenTypeBodyBox = (font: opentype.Font): StructureBodyBox => {
  const unitsPerEm = font.unitsPerEm || 1000
  const top =
    typeof font.ascender === 'number' && Number.isFinite(font.ascender)
      ? font.ascender
      : Math.round(unitsPerEm * DEFAULT_ASCENDER_RATIO)
  const bottom =
    typeof font.descender === 'number' && Number.isFinite(font.descender)
      ? font.descender
      : top - unitsPerEm
  return { top, bottom, unitsPerEm }
}

export interface OpenTypeSamplingResult {
  bodyBox: StructureBodyBox
  samples: GlyphGeometrySample[]
}

export const buildOpenTypeGeometrySamples = (
  font: opentype.Font
): OpenTypeSamplingResult => {
  const bodyBox = getOpenTypeBodyBox(font)
  const samples: GlyphGeometrySample[] = []
  const seenCharacters = new Set<string>()

  for (let index = 1; index < font.glyphs.length; index += 1) {
    const glyph = font.glyphs.get(index)
    const characters = [...new Set(glyph.unicodes ?? [])]
      .filter(isHanCodePoint)
      .map((codePoint) => String.fromCodePoint(codePoint))
      .filter((character) => !seenCharacters.has(character))
    if (characters.length === 0 || !glyph.path?.commands?.length) {
      continue
    }

    const polygons = openTypePathToPolygons(glyph.path.commands)
    const bounds = getPolygonsBounds(polygons)
    const advance = glyph.advanceWidth ?? font.unitsPerEm
    if (!bounds || advance <= 0) {
      continue
    }
    for (const character of characters) {
      seenCharacters.add(character)
    }

    samples.push({
      glyphId: glyph.name || `glyph-${index}`,
      glyphName: glyph.name || `glyph-${index}`,
      character: characters[0],
      advance,
      bounds,
      sides: buildSidesFromPolygons(polygons, bounds, advance, bodyBox),
      ink: computeInkFromPolygons(polygons, advance, bodyBox.unitsPerEm),
    })
  }

  return { bodyBox, samples }
}
