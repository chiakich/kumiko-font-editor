// Recursive cubic Bézier fitting (Schneider, "Graphics Gems" 1990), built on
// the single-segment fitCubic primitives ported from fontra. Fits a stream of
// freehand points into a chain of cubic segments, splitting at the point of
// largest error until each segment is within tolerance.

import { Bezier } from 'bezier-js'
import {
  chordLengthParameterize,
  computeMaxError,
  fitCubic,
} from '@/font/fontra-ported/fit-cubic'

interface Pt {
  x: number
  y: number
}

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y }
}

function normalize(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y)
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len }
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of points) {
    const last = out.at(-1)
    if (!last || last.x !== p.x || last.y !== p.y) {
      out.push(p)
    }
  }
  return out
}

// `error` is a squared distance tolerance (font units²), matching the
// squared error returned by computeMaxError.
export function fitCurve(points: Pt[], error: number): Bezier[] {
  const pts = dedupe(points)
  if (pts.length < 2) {
    return []
  }
  const leftTangent = normalize(sub(pts[1], pts[0]))
  const rightTangent = normalize(sub(pts[pts.length - 2], pts[pts.length - 1]))
  return fitCubicRecursive(pts, leftTangent, rightTangent, error)
}

function fitCubicRecursive(
  points: Pt[],
  leftTangent: Pt,
  rightTangent: Pt,
  error: number
): Bezier[] {
  if (points.length === 2) {
    // Straight run: place handles a third of the way along each tangent.
    const dist =
      Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / 3
    return [
      new Bezier(
        points[0],
        {
          x: points[0].x + leftTangent.x * dist,
          y: points[0].y + leftTangent.y * dist,
        },
        {
          x: points[1].x + rightTangent.x * dist,
          y: points[1].y + rightTangent.y * dist,
        },
        points[1]
      ),
    ]
  }

  const bezier = fitCubic(points, leftTangent, rightTangent, error)
  const params = chordLengthParameterize(points)
  const [maxError, rawSplit] = computeMaxError(points, bezier, params)
  if (maxError < error) {
    return [bezier]
  }

  // Split at the worst-fitting point and fit each half independently. The two
  // halves share a tangent at the split, so the join stays smooth.
  const splitPoint = Math.min(Math.max(rawSplit, 1), points.length - 2)
  const centerTangent = normalize(
    sub(points[splitPoint - 1], points[splitPoint + 1])
  )
  const left = fitCubicRecursive(
    points.slice(0, splitPoint + 1),
    leftTangent,
    centerTangent,
    error
  )
  const right = fitCubicRecursive(
    points.slice(splitPoint),
    { x: -centerTangent.x, y: -centerTangent.y },
    rightTangent,
    error
  )
  return [...left, ...right]
}
