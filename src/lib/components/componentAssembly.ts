// Geometry helpers for assembling CJK glyphs from parts of other glyphs,
// guided by GlyphWiki part placement boxes.

import type { FontData, PathData } from '@/store'
import type { GlyphwikiPartBox } from '@/lib/glyph/glyphwikiComposition'

export interface Rect {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}

export interface FontVerticalBox {
  // Font-unit y of the em-box top/bottom (CJK design space).
  top: number
  bottom: number
}

export const getFontVerticalBox = (
  fontData: Pick<FontData, 'unitsPerEm' | 'lineMetricsHorizontalLayout'>
): FontVerticalBox => {
  const unitsPerEm = fontData.unitsPerEm ?? 1000
  const top =
    fontData.lineMetricsHorizontalLayout?.ascender?.value ??
    Math.round(unitsPerEm * 0.88)
  return { top, bottom: top - unitsPerEm }
}

// GlyphWiki boxes live on a 200x200 canvas with y growing downward; the
// canvas spans the full em box horizontally (advance width) and vertically.
export const mapGlyphwikiBoxToFontUnits = (
  box: GlyphwikiPartBox,
  advanceWidth: number,
  verticalBox: FontVerticalBox
): Rect => {
  const emHeight = verticalBox.top - verticalBox.bottom
  return {
    xMin: (box.x1 / 200) * advanceWidth,
    xMax: (box.x2 / 200) * advanceWidth,
    yMax: verticalBox.top - (box.y1 / 200) * emHeight,
    yMin: verticalBox.top - (box.y2 / 200) * emHeight,
  }
}

export const getPathsBounds = (paths: PathData[]): Rect | null => {
  let bounds: Rect | null = null
  for (const path of paths) {
    for (const node of path.nodes) {
      if (!bounds) {
        bounds = { xMin: node.x, yMin: node.y, xMax: node.x, yMax: node.y }
        continue
      }
      bounds.xMin = Math.min(bounds.xMin, node.x)
      bounds.yMin = Math.min(bounds.yMin, node.y)
      bounds.xMax = Math.max(bounds.xMax, node.x)
      bounds.yMax = Math.max(bounds.yMax, node.y)
    }
  }
  return bounds
}

const rectArea = (rect: Rect) =>
  Math.max(0, rect.xMax - rect.xMin) * Math.max(0, rect.yMax - rect.yMin)

const intersectionArea = (left: Rect, right: Rect) => {
  const xOverlap = Math.max(
    0,
    Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin)
  )
  const yOverlap = Math.max(
    0,
    Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin)
  )
  return xOverlap * yOverlap
}

const PART_OVERLAP_THRESHOLD = 0.55

// Pick the paths of a donor glyph that belong to the part occupying
// `partBox` (both in the donor's font units).
export const extractPartPaths = (paths: PathData[], partBox: Rect) =>
  paths.filter((path) => {
    const bounds = getPathsBounds([path])
    if (!bounds) {
      return false
    }
    const area = rectArea(bounds)
    if (area === 0) {
      // Degenerate (e.g. vertical stroke): fall back to center containment.
      const centerX = (bounds.xMin + bounds.xMax) / 2
      const centerY = (bounds.yMin + bounds.yMax) / 2
      return (
        centerX >= partBox.xMin &&
        centerX <= partBox.xMax &&
        centerY >= partBox.yMin &&
        centerY <= partBox.yMax
      )
    }
    return intersectionArea(bounds, partBox) / area >= PART_OVERLAP_THRESHOLD
  })

const GROUP_OVERLAP_THRESHOLD = 0.4

// Partition paths among semantic part boxes (e.g. the 火/垔 regions of 煙):
// each path goes to the box covering most of it; unclaimed paths are
// returned separately for geometric fallback grouping.
export const groupPathsByPartBoxes = (
  paths: PathData[],
  partRects: Rect[]
): { groups: PathData[][]; remaining: PathData[] } => {
  const groups: PathData[][] = partRects.map(() => [])
  const remaining: PathData[] = []

  for (const path of paths) {
    const bounds = getPathsBounds([path])
    if (!bounds) {
      remaining.push(path)
      continue
    }

    const area = rectArea(bounds)
    let bestIndex = -1
    let bestRatio = 0
    for (let index = 0; index < partRects.length; index += 1) {
      const rect = partRects[index]!
      const ratio =
        area > 0
          ? intersectionArea(bounds, rect) / area
          : (bounds.xMin + bounds.xMax) / 2 >= rect.xMin &&
              (bounds.xMin + bounds.xMax) / 2 <= rect.xMax &&
              (bounds.yMin + bounds.yMax) / 2 >= rect.yMin &&
              (bounds.yMin + bounds.yMax) / 2 <= rect.yMax
            ? 1
            : 0
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestIndex = index
      }
    }

    if (bestIndex >= 0 && bestRatio >= GROUP_OVERLAP_THRESHOLD) {
      groups[bestIndex]!.push(path)
    } else {
      remaining.push(path)
    }
  }

  return { groups, remaining }
}

export interface AlignTransform {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

// Translation only: the part keeps its drawn size and stroke weights, while
// preserving where it sits inside its original GlyphWiki part box.
export const computePartBoxPlacement = (
  sourcePartBox: Rect,
  targetPartBox: Rect
): AlignTransform => ({
  scaleX: 1,
  scaleY: 1,
  offsetX: Math.round(targetPartBox.xMin - sourcePartBox.xMin),
  offsetY: Math.round(targetPartBox.yMax - sourcePartBox.yMax),
})

let transformIdCounter = 0
const nextId = (prefix: string) =>
  `${prefix}_ca${(transformIdCounter += 1).toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const transformPaths = (
  paths: PathData[],
  transform: AlignTransform
): PathData[] =>
  paths.map((path) => ({
    id: nextId('path'),
    closed: path.closed,
    nodes: path.nodes.map((node) => ({
      ...node,
      id: nextId('node'),
      x: Math.round(node.x * transform.scaleX + transform.offsetX),
      y: Math.round(node.y * transform.scaleY + transform.offsetY),
    })),
  }))

// Lower is better: compares the part's normalized geometry (relative to the
// em box) between a donor glyph and the target placement.
export const scorePartFit = (
  donorBox: GlyphwikiPartBox,
  targetBox: GlyphwikiPartBox
) => {
  const donorWidth = (donorBox.x2 - donorBox.x1) / 200
  const donorHeight = (donorBox.y2 - donorBox.y1) / 200
  const targetWidth = (targetBox.x2 - targetBox.x1) / 200
  const targetHeight = (targetBox.y2 - targetBox.y1) / 200
  const donorCenterX = (donorBox.x1 + donorBox.x2) / 400
  const donorCenterY = (donorBox.y1 + donorBox.y2) / 400
  const targetCenterX = (targetBox.x1 + targetBox.x2) / 400
  const targetCenterY = (targetBox.y1 + targetBox.y2) / 400

  return (
    Math.abs(donorWidth - targetWidth) +
    Math.abs(donorHeight - targetHeight) +
    0.5 *
      (Math.abs(donorCenterX - targetCenterX) +
        Math.abs(donorCenterY - targetCenterY))
  )
}
