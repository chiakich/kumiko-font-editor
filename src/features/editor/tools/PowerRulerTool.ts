import { Bezier } from 'bezier-js'
import {
  BaseTool,
  type EventStream,
  type ToolEvent,
} from 'src/features/editor/tools/BaseTool'
import { asyncEventIterator } from 'src/features/editor/tools/toolPrimitives'
import { glyphRulerSegments, type Vec } from 'src/font/powerRuler'

// Snap distance (screen px) within which a click jumps to the contour normal.
const SNAP_SCREEN_DISTANCE = 8

export class PowerRulerTool extends BaseTool {
  identifier = 'ruler'

  override activate(): void {
    this.setCursor('crosshair')
  }

  override deactivate(): void {
    super.deactivate()
    this.sceneModel.powerRuler = undefined
    this.canvasController.requestUpdate()
  }

  override handleHover(): void {
    this.setCursor('crosshair')
  }

  async handleDrag(
    eventStream: EventStream,
    initialEvent: ToolEvent
  ): Promise<void> {
    initialEvent.preventDefault()

    const glyphPath = this.sceneModel.glyph?.glyph.path
    if (!glyphPath) {
      eventStream.done()
      return
    }

    const pointA = this.localPoint(initialEvent)
    const apply = (basePoint: Vec, directionVector: Vec) => {
      this.sceneModel.powerRuler = { basePoint, directionVector }
      this.canvasController.requestUpdate()
    }

    // A plain click snaps the ruler to the contour normal under the cursor.
    const snappedDirection = this.snapToNormal(glyphPath, pointA)
    if (snappedDirection) {
      apply(pointA, snappedDirection)
    }

    let didDrag = false
    for await (const event of asyncEventIterator(eventStream)) {
      event.preventDefault()
      const raw = this.localPoint(event)
      const pointB = event.shiftKey ? constrainHorVerDiag(pointA, raw) : raw
      if (!didDrag && BaseTool.shouldInitiateDrag(pointA, pointB)) {
        didDrag = true
      }
      if (didDrag) {
        const direction = normalize({
          x: pointB.x - pointA.x,
          y: pointB.y - pointA.y,
        })
        if (direction) {
          apply(pointA, direction)
        }
      }
    }

    // Click on empty space (no drag, no snap) clears the ruler.
    if (!didDrag && !snappedDirection) {
      this.sceneModel.powerRuler = undefined
      this.canvasController.requestUpdate()
    }
  }

  private snapToNormal(
    glyphPath: Parameters<typeof glyphRulerSegments>[0],
    point: Vec
  ): Vec | null {
    const threshold = SNAP_SCREEN_DISTANCE / this.canvasController.magnification
    let bestDistance = threshold
    let bestTangent: Vec | null = null

    for (const segment of glyphRulerSegments(glyphPath)) {
      const pts = segment.points
      if (pts.length < 2) {
        continue
      }
      let nearest: Vec
      let tangent: Vec
      if (segment.type === 'line' || pts.length === 2) {
        const result = nearestOnLine(pts[0], pts[pts.length - 1], point)
        nearest = result.point
        tangent = result.tangent
      } else {
        const bezier = new Bezier(...pts.map((p) => ({ x: p.x, y: p.y })))
        const projected = bezier.project(point)
        nearest = { x: projected.x, y: projected.y }
        tangent = bezier.derivative(projected.t ?? 0.5)
      }
      const distance = Math.hypot(nearest.x - point.x, nearest.y - point.y)
      if (distance < bestDistance) {
        bestDistance = distance
        bestTangent = tangent
      }
    }

    if (!bestTangent) {
      return null
    }
    return normalize({ x: -bestTangent.y, y: bestTangent.x })
  }
}

function normalize(v: Vec): Vec | null {
  const length = Math.hypot(v.x, v.y)
  if (length < 1e-9) {
    return null
  }
  return { x: v.x / length, y: v.y / length }
}

function nearestOnLine(a: Vec, b: Vec, p: Vec): { point: Vec; tangent: Vec } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t =
    lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  const clamped = Math.max(0, Math.min(1, t))
  return {
    point: { x: a.x + dx * clamped, y: a.y + dy * clamped },
    tangent: { x: dx, y: dy },
  }
}

function constrainHorVerDiag(origin: Vec, point: Vec): Vec {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  if (Math.abs(dx) > Math.abs(dy) * 2) {
    return { x: point.x, y: origin.y }
  }
  if (Math.abs(dy) > Math.abs(dx) * 2) {
    return { x: origin.x, y: point.y }
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: origin.x + Math.sign(dx || 1) * size,
    y: origin.y + Math.sign(dy || 1) * size,
  }
}
