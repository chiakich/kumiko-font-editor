import type {
  PartSpacingMetrics,
  SemanticPartLayout,
} from 'src/lib/qualityCheck/partSpacingMetrics'
import type {
  GeometryBounds,
  GeometryPoint,
} from 'src/lib/qualityCheck/polygonGeometry'

const MASK_SIZE = 128
const MIN_INTERFACE_SAMPLES = 12

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const intersectionsAtY = (polygon: GeometryPoint[], y: number) => {
  const intersections: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    if ((current.y <= y && y < next.y) || (next.y <= y && y < current.y)) {
      const t = (y - current.y) / (next.y - current.y)
      intersections.push(current.x + (next.x - current.x) * t)
    }
  }
  return intersections.sort((left, right) => left - right)
}

/**
 * 每個封閉 contour 以 even-odd 成對填入，再對所有 contour 取 union。
 * counter 會被填滿，但不改變部件朝向介面的外緣；這裡只量介面，不拿 mask
 * 算墨量，因此可避免完整布林輪廓運算的成本。
 */
const rasterizeInkMask = (
  polygons: GeometryPoint[][],
  bounds: GeometryBounds
) => {
  const width = bounds.xMax - bounds.xMin
  const height = bounds.yMax - bounds.yMin
  const mask = new Uint8Array(MASK_SIZE * MASK_SIZE)
  if (width <= 0 || height <= 0) {
    return mask
  }
  const xBin = (x: number) =>
    Math.min(
      MASK_SIZE - 1,
      Math.max(0, Math.floor(((x - bounds.xMin) / width) * MASK_SIZE))
    )

  for (let row = 0; row < MASK_SIZE; row += 1) {
    const y = bounds.yMin + ((row + 0.5) / MASK_SIZE) * height
    for (const polygon of polygons) {
      const intersections = intersectionsAtY(polygon, y)
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const from = xBin(intersections[index])
        const to = xBin(intersections[index + 1])
        for (let column = from; column <= to; column += 1) {
          mask[row * MASK_SIZE + column] = 1
        }
      }
    }
  }
  return mask
}

const horizontalGaps = (mask: Uint8Array, split: number) => {
  const gaps: number[] = []
  let touching = 0
  for (let row = 0; row < MASK_SIZE; row += 1) {
    let firstEdge = -1
    let secondEdge = -1
    for (let column = 0; column < split; column += 1) {
      if (mask[row * MASK_SIZE + column]) {
        firstEdge = column
      }
    }
    for (let column = split; column < MASK_SIZE; column += 1) {
      if (mask[row * MASK_SIZE + column]) {
        secondEdge = column
        break
      }
    }
    if (firstEdge < 0 || secondEdge < 0) {
      continue
    }
    const gap = Math.max(0, secondEdge - firstEdge - 1)
    gaps.push(gap)
    if (gap === 0) {
      touching += 1
    }
  }
  return { gaps, touching }
}

const verticalGaps = (mask: Uint8Array, split: number) => {
  const gaps: number[] = []
  let touching = 0
  for (let column = 0; column < MASK_SIZE; column += 1) {
    let bottomEdge = -1
    let topEdge = -1
    for (let row = 0; row < split; row += 1) {
      if (mask[row * MASK_SIZE + column]) {
        bottomEdge = row
      }
    }
    for (let row = split; row < MASK_SIZE; row += 1) {
      if (mask[row * MASK_SIZE + column]) {
        topEdge = row
        break
      }
    }
    if (bottomEdge < 0 || topEdge < 0) {
      continue
    }
    const gap = Math.max(0, topEdge - bottomEdge - 1)
    gaps.push(gap)
    if (gap === 0) {
      touching += 1
    }
  }
  return { gaps, touching }
}

const horizontalSeparation = (mask: Uint8Array, split: number) => {
  let firstSum = 0
  let firstCount = 0
  let secondSum = 0
  let secondCount = 0
  for (let row = 0; row < MASK_SIZE; row += 1) {
    for (let column = 0; column < MASK_SIZE; column += 1) {
      if (!mask[row * MASK_SIZE + column]) {
        continue
      }
      if (column < split) {
        firstSum += column + 0.5
        firstCount += 1
      } else {
        secondSum += column + 0.5
        secondCount += 1
      }
    }
  }
  return firstCount > 0 && secondCount > 0
    ? secondSum / secondCount / MASK_SIZE - firstSum / firstCount / MASK_SIZE
    : null
}

const verticalSeparation = (mask: Uint8Array, split: number) => {
  let bottomSum = 0
  let bottomCount = 0
  let topSum = 0
  let topCount = 0
  for (let row = 0; row < MASK_SIZE; row += 1) {
    for (let column = 0; column < MASK_SIZE; column += 1) {
      if (!mask[row * MASK_SIZE + column]) {
        continue
      }
      if (row < split) {
        bottomSum += row + 0.5
        bottomCount += 1
      } else {
        topSum += row + 0.5
        topCount += 1
      }
    }
  }
  return bottomCount > 0 && topCount > 0
    ? topSum / topCount / MASK_SIZE - bottomSum / bottomCount / MASK_SIZE
    : null
}

export const computeRasterPartSpacingMetrics = (
  polygons: GeometryPoint[][],
  bounds: GeometryBounds,
  layout: SemanticPartLayout
): PartSpacingMetrics | null => {
  const mask = rasterizeInkMask(polygons, bounds)
  const split = Math.min(
    MASK_SIZE - 1,
    Math.max(1, Math.round(layout.splitRatio * MASK_SIZE))
  )
  // GlyphWiki 與 raster row 都以 top/bottom 語意分組；mask row 座標雖由下往上，
  // split 到兩側的距離不變，因此直接使用 1-splitRatio。
  const result =
    layout.axis === 'horizontal'
      ? horizontalGaps(mask, split)
      : verticalGaps(mask, MASK_SIZE - split)
  const separationRatio =
    layout.axis === 'horizontal'
      ? horizontalSeparation(mask, split)
      : verticalSeparation(mask, MASK_SIZE - split)
  if (result.gaps.length < MIN_INTERFACE_SAMPLES || separationRatio === null) {
    return null
  }
  return {
    axis: layout.axis,
    firstCharacter: layout.firstCharacter,
    secondCharacter: layout.secondCharacter,
    splitRatio: layout.splitRatio,
    gapRatio: median(result.gaps) / MASK_SIZE,
    overlapRatio: result.touching / result.gaps.length,
    separationRatio,
    sampleCount: result.gaps.length,
  }
}
