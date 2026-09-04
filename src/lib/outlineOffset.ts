import paper from 'paper'
import type { PathData, PathNode } from '@/domain'
import { isOffCurveNode, isOnCurveNode } from '@/domain/glyphGeometry'
import {
  collectPaperPaths,
  paperPathToPathData,
  pathToPaperPath,
} from '@/lib/pathBooleanOperations'

export interface OutlineOffsetOptions {
  // When on, rebuild a contour through paper.js ONLY if it self-intersects or
  // overlaps another after displacement, to remove the overlap. Rebuilding
  // changes that contour's node ids/structure (breaks master interpolation),
  // so contours without crossings always keep their original nodes.
  cleanup?: boolean
  miterLimit?: number
  // Limit the offset to these contour ids (e.g. the current selection). When
  // omitted, every contour is offset. The orientation sign is always derived
  // from all contours so "+distance" stays "embolden".
  pathIds?: string[] | null
}

export interface OffsetResult {
  paths: PathData[]
  // True when paper.js rebuilt contours to clear crossings (node ids changed).
  rebuilt: boolean
}

interface Vec {
  x: number
  y: number
}

const EPS = 1e-6
const DEFAULT_MITER_LIMIT = 4

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })

const normalize = (v: Vec): Vec | null => {
  const len = Math.hypot(v.x, v.y)
  return len < EPS ? null : { x: v.x / len, y: v.y / len }
}

// Right-hand normal in y-up font space.
const rightNormal = (v: Vec): Vec => ({ x: v.y, y: -v.x })

// Shoelace signed area over a contour's on-curve points. Only the sign matters
// here, so ignoring off-curve handles is fine.
const contourSignedArea = (path: PathData): number => {
  const points = path.nodes.filter(isOnCurveNode)
  if (points.length < 3) {
    return 0
  }
  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum
}

// Net orientation decides which way "+distance" grows ink, so positive distance
// always emboldens regardless of the font's winding convention (PostScript CCW
// vs TrueType CW). Counters wind opposite to outer contours, so one global
// handedness shrinks them while outer contours grow — uniform ink growth.
const globalOrientationSign = (paths: PathData[]): number => {
  let sum = 0
  for (const path of paths) {
    sum += contourSignedArea(path)
  }
  return sum >= 0 ? 1 : -1
}

const isOffsetable = (path: PathData): boolean =>
  path.closed && path.nodes.filter(isOnCurveNode).length >= 2

// Intersection of line (a + t·da) with line (b + s·db). Null if near-parallel.
const intersectLines = (a: Vec, da: Vec, b: Vec, db: Vec): Vec | null => {
  const denom = da.x * db.y - da.y * db.x
  if (Math.abs(denom) < EPS) {
    return null
  }
  const t = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / denom
  return { x: a.x + da.x * t, y: a.y + da.y * t }
}

// New position of an on-curve node. Corners use the miter bisector so straight
// stems keep sharp, uniformly thick right angles; smooth/endpoint nodes use the
// centered-difference normal.
const onCurveDisplacement = (
  node: PathNode,
  prev: Vec,
  cur: Vec,
  next: Vec,
  delta: number,
  miterLimit: number
): Vec => {
  if (isOnCurveNode(node) && !node.smooth) {
    const inDir = normalize(sub(cur, prev))
    const outDir = normalize(sub(next, cur))
    if (inDir && outDir) {
      const nIn = rightNormal(inDir)
      const nOut = rightNormal(outDir)
      const bisector = normalize({ x: nIn.x + nOut.x, y: nIn.y + nOut.y })
      if (bisector) {
        const cos = bisector.x * nIn.x + bisector.y * nIn.y
        const miter = (1 / Math.max(cos, 1 / miterLimit)) * delta
        return { x: bisector.x * miter, y: bisector.y * miter }
      }
    }
  }

  const tangent =
    normalize(sub(next, prev)) ??
    normalize(sub(next, cur)) ??
    normalize(sub(cur, prev))
  if (!tangent) {
    return { x: 0, y: 0 }
  }
  const normal = rightNormal(tangent)
  return { x: normal.x * delta, y: normal.y * delta }
}

const displaceContour = (
  path: PathData,
  distance: number,
  sign: number,
  miterLimit: number
): PathData => {
  const nodes = path.nodes
  const count = nodes.length
  const delta = distance * sign
  const point = (index: number): Vec => ({
    x: nodes[index].x,
    y: nodes[index].y,
  })
  const result = nodes.map((node) => ({ ...node }))
  const setNode = (index: number, position: Vec) => {
    result[index].x = Math.round(position.x)
    result[index].y = Math.round(position.y)
  }

  // ── On-curve nodes ──────────────────────────────────────────────────────
  const onCurve: number[] = []
  nodes.forEach((node, index) => {
    if (isOnCurveNode(node)) {
      onCurve.push(index)
    }
  })
  for (const index of onCurve) {
    const prevIndex = path.closed
      ? (index - 1 + count) % count
      : Math.max(0, index - 1)
    const nextIndex = path.closed
      ? (index + 1) % count
      : Math.min(count - 1, index + 1)
    const disp = onCurveDisplacement(
      nodes[index],
      point(prevIndex),
      point(index),
      point(nextIndex),
      delta,
      miterLimit
    )
    setNode(index, { x: nodes[index].x + disp.x, y: nodes[index].y + disp.y })
  }

  // ── Handles, per segment ─────────────────────────────────────────────────
  const segmentCount = path.closed ? onCurve.length : onCurve.length - 1
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const startOn = onCurve[segment]
    const endOn = onCurve[(segment + 1) % onCurve.length]
    const handles: number[] = []
    for (let index = (startOn + 1) % count; index !== endOn; ) {
      if (!isOffCurveNode(nodes[index])) {
        break
      }
      handles.push(index)
      index = (index + 1) % count
    }
    if (handles.length === 0) {
      continue
    }

    const start = point(startOn)
    const end = point(endOn)
    const startAfter = { x: result[startOn].x, y: result[startOn].y }
    const endAfter = { x: result[endOn].x, y: result[endOn].y }

    if (handles.length === 1) {
      // Quadratic: the control point is the intersection of the two tangents.
      // Tangent directions are preserved, so rebuild it from the moved
      // endpoints; if they are parallel (straight) just translate the handle.
      const handle = point(handles[0])
      const tStart = normalize(sub(handle, start))
      const tEnd = normalize(sub(end, handle))
      const next =
        tStart && tEnd
          ? intersectLines(startAfter, tStart, endAfter, tEnd)
          : null
      setNode(
        handles[0],
        next ?? {
          x: handle.x + (startAfter.x - start.x),
          y: handle.y + (startAfter.y - start.y),
        }
      )
      continue
    }

    // Cubic: endpoint tangents are preserved by the offset, so for a circular
    // arc the handle length scales with the chord. Scaling (original handle −
    // endpoint) by the chord ratio is exact for arcs, stable everywhere else,
    // and degrades gracefully (straight segment → ratio 1 → parallel shift)
    // instead of collapsing handles like a control-leg intersection does.
    const firstIdx = handles[0]
    const lastIdx = handles[handles.length - 1]
    const first = point(firstIdx)
    const last = point(lastIdx)
    const oldChordX = end.x - start.x
    const oldChordY = end.y - start.y
    const newChordX = endAfter.x - startAfter.x
    const newChordY = endAfter.y - startAfter.y
    const oldChord = Math.hypot(oldChordX, oldChordY)
    const newChord = Math.hypot(newChordX, newChordY)

    // A concave corner's radius shrinks by the offset, so a heavy offset can
    // collapse the segment or flip its endpoints past each other. Detect that
    // (chord reversed or vanished) and degrade to a straight segment so it can
    // never become an inverted loop/spike — turning on cleanup then merges the
    // resulting overlap.
    const reversed = oldChordX * newChordX + oldChordY * newChordY < 0
    if (oldChord < EPS || newChord < EPS || reversed) {
      for (const handleIndex of handles) {
        const t =
          handles.length === 1
            ? 0.5
            : handles.indexOf(handleIndex) / (handles.length - 1)
        setNode(handleIndex, {
          x: startAfter.x + newChordX * t,
          y: startAfter.y + newChordY * t,
        })
      }
      continue
    }

    const scale = newChord / oldChord
    setNode(firstIdx, {
      x: startAfter.x + (first.x - start.x) * scale,
      y: startAfter.y + (first.y - start.y) * scale,
    })
    setNode(lastIdx, {
      x: endAfter.x + (last.x - end.x) * scale,
      y: endAfter.y + (last.y - end.y) * scale,
    })
    // Extra interior handles (rare) follow the average endpoint shift.
    if (handles.length > 2) {
      const shiftX = (startAfter.x - start.x + (endAfter.x - end.x)) / 2
      const shiftY = (startAfter.y - start.y + (endAfter.y - end.y)) / 2
      for (let extra = 1; extra < handles.length - 1; extra += 1) {
        const middle = point(handles[extra])
        setNode(handles[extra], {
          x: middle.x + shiftX,
          y: middle.y + shiftY,
        })
      }
    }
  }

  return { ...path, nodes: result }
}

// Clean each contour's OWN self-intersections (the spikes/loops an offset can
// create at a collapsed corner). Each contour is resolved independently, so
// intentional overlaps between separate contours (a stroke crossing a box, an
// overlapping component) are preserved — a global boolean would slice those
// into slivers. Returns null when nothing needed rebuilding, so callers keep
// the structure-preserving displaced nodes. Rebuilt contours get new node ids.
const cleanCrossingContours = (paths: PathData[]): PathData[] | null => {
  const scope = new paper.PaperScope()
  scope.setup(new scope.Size(1, 1))

  let rebuiltAny = false
  const result: PathData[] = []
  for (const path of paths) {
    if (!(path.closed && path.nodes.length > 2)) {
      result.push(path)
      continue
    }

    const paperPath = pathToPaperPath(scope, path)
    if (!paperPath) {
      result.push(path)
      continue
    }
    // pathToPaperPath appends a closing segment back to the start point; drop
    // the duplicate so it is not mistaken for a degenerate self-crossing.
    const segments = paperPath.segments
    const last = segments[segments.length - 1]
    if (
      paperPath.closed &&
      segments.length > 1 &&
      last.point.equals(segments[0].point)
    ) {
      last.remove()
    }

    // getIntersections / resolveCrossings exist at runtime (paper's boolean ops
    // use them) but are missing from the 0.12 typings, hence the casts. No-arg
    // getIntersections returns this path's self-intersections.
    const intersections = (
      paperPath as unknown as {
        getIntersections: () => Array<{ isCrossing: () => boolean }>
      }
    ).getIntersections()
    if (!intersections.some((location) => location.isCrossing())) {
      paperPath.remove()
      result.push(path)
      continue
    }

    const resolved = (
      paperPath as unknown as { resolveCrossings: () => paper.PathItem }
    ).resolveCrossings()
    const rebuilt = collectPaperPaths(resolved).flatMap((item, index) => {
      const pathData = paperPathToPathData(item, `${path.id}_clean_${index}`)
      return pathData ? [pathData] : []
    })
    if (rebuilt.length > 0) {
      result.push(...rebuilt)
      rebuiltAny = true
    } else {
      result.push(path)
    }
  }

  scope.project.remove()
  return rebuiltAny ? result : null
}

// Offset contours by `distance` font units along their outward normal. Positive
// distance emboldens (ink grows), negative thins. With `pathIds`, only those
// contours move (the rest pass through). Open/degenerate contours are unchanged.
export const offsetGlyphPaths = (
  paths: PathData[],
  distance: number,
  options: OutlineOffsetOptions = {}
): OffsetResult => {
  if (!Number.isFinite(distance) || distance === 0) {
    return { paths, rebuilt: false }
  }

  const miterLimit = options.miterLimit ?? DEFAULT_MITER_LIMIT
  const limit =
    options.pathIds && options.pathIds.length > 0
      ? new Set(options.pathIds)
      : null
  const isAffected = (path: PathData) =>
    isOffsetable(path) && (!limit || limit.has(path.id))

  if (!paths.some(isAffected)) {
    return { paths, rebuilt: false }
  }

  // Sign comes from the whole glyph so "+distance" embolds even when only a
  // counter is selected.
  const sign = globalOrientationSign(paths.filter(isOffsetable))
  const displaced = paths.map((path) =>
    isAffected(path) ? displaceContour(path, distance, sign, miterLimit) : path
  )

  if (!options.cleanup) {
    return { paths: displaced, rebuilt: false }
  }

  const cleaned = cleanCrossingContours(displaced.filter(isAffected))
  if (!cleaned) {
    return { paths: displaced, rebuilt: false }
  }

  // Splice rebuilt contours in at the first affected slot, keeping every
  // untouched contour (and its node ids) in place.
  const result: PathData[] = []
  let inserted = false
  for (const path of displaced) {
    if (isAffected(path)) {
      if (!inserted) {
        result.push(...cleaned)
        inserted = true
      }
      continue
    }
    result.push(path)
  }
  return { paths: result, rebuilt: true }
}

export const hasOffsetableContour = (paths: PathData[]): boolean =>
  paths.some(isOffsetable)
