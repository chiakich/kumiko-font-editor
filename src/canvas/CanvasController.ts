// 處理 Canvas 基礎渲染、縮放、平移和事件處理

import type { SceneView } from './SceneView'
import type { SceneModel } from './SceneView'

const MIN_MAGNIFICATION = 0.005
const MAX_MAGNIFICATION = 800

export interface Point {
  x: number
  y: number
}

export interface Rect {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}

/**
 * Viewport state for the canvas.
 * - `zoom`: the magnification level (font units → screen pixels).
 * - `pan`: offset from the canvas center, in screen pixels.
 *   When pan is `{ x: 0, y: 0 }`, the font coordinate origin (0, 0)
 *   is located at the center of the canvas.
 */
export interface Viewport {
  zoom: number
  pan: { x: number; y: number }
}

export class CanvasController {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  sceneView: SceneView | null = null
  sceneModel: SceneModel | null = null

  /**
   * Called whenever the viewport changes due to user interaction
   * (scroll, pinch, resize) or programmatic methods like `fitRect`.
   * NOT called by `setViewport` to avoid feedback loops.
   */
  onViewportChange: ((viewport: Readonly<Viewport>) => void) | null = null

  private _viewport: Viewport = { zoom: 1, pan: { x: 0, y: 0 } }
  private _resizeObserver: ResizeObserver | null = null
  private _initialScrollTarget: EventTarget | null = null
  private _scrollTimerID: number | null = null
  private _updateRequested = false
  private _previousOffsets: {
    parentOffsetX: number
    parentOffsetY: number
  } | null = null
  private _initialZoom = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D context')
    }
    this.context = ctx

    // Setup resize observer
    this._resizeObserver = new ResizeObserver(() => {
      this.setupSize()
      this.draw()
    })
    this._resizeObserver.observe(this.canvas.parentElement!)

    this._setupScrollBlocker()

    // Event listeners
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this))

    // Safari pinch zoom
    this.canvas.addEventListener(
      'gesturestart',
      this.handleSafariGestureStart.bind(this)
    )
    this.canvas.addEventListener(
      'gesturechange',
      this.handleSafariGestureChange.bind(this)
    )
    this.canvas.addEventListener(
      'gestureend',
      this.handleSafariGestureEnd.bind(this)
    )

    this.setupSize()
    this.requestUpdate()
  }

  // -- Viewport API --------------------------------------------------------

  /** Current viewport state (read-only). */
  get viewport(): Readonly<Viewport> {
    return this._viewport
  }

  /**
   * Current zoom level (magnification).
   * Convenience alias for `viewport.zoom`. Used by visualization layers
   * and tools to convert screen-space sizes to font-space sizes.
   */
  get magnification(): number {
    return this._viewport.zoom
  }

  /**
   * Push a new viewport state from the consumer (e.g. React store).
   * Does NOT trigger `onViewportChange` to avoid feedback loops.
   */
  setViewport(viewport: Viewport) {
    this._viewport = {
      zoom: clampZoom(viewport.zoom),
      pan: { x: viewport.pan.x, y: viewport.pan.y },
    }
    this.requestUpdate()
  }

  /**
   * Fit a rectangle (in font coordinates) into the canvas viewport,
   * centering it and choosing the largest zoom that shows the entire rect.
   */
  fitRect(rect: Rect) {
    const validated = validateRect(rect)
    const zoom = this._computeFitZoom(validated)
    const center = rectCenter(validated)
    this._viewport = {
      zoom,
      pan: {
        x: -center.x * zoom,
        y: center.y * zoom,
      },
    }
    // Reset cached offsets so a subsequent setupSize() from the ResizeObserver
    // won't apply a stale parent-offset delta that undoes this centering.
    this._previousOffsets = {
      parentOffsetX: this.canvas.parentElement?.offsetLeft ?? 0,
      parentOffsetY: this.canvas.parentElement?.offsetTop ?? 0,
    }
    this._notifyViewportChange()
    this.requestUpdate()
  }

  /**
   * Pan the viewport by the given screen-pixel deltas.
   */
  panBy(deltaX: number, deltaY: number) {
    this._viewport.pan.x += deltaX
    this._viewport.pan.y += deltaY
    this.requestUpdate()
    this._notifyViewportChange()
  }

  // -- Computed origin (internal) ------------------------------------------

  /**
   * The pixel position on the canvas where font-coordinate (0, 0) is drawn.
   * Computed from viewport: origin = canvasCenter + pan.
   */
  private get _originX(): number {
    return this.canvasWidth / 2 + this._viewport.pan.x
  }

  private get _originY(): number {
    return this.canvasHeight / 2 + this._viewport.pan.y
  }

  // -- Scroll blocker ------------------------------------------------------

  private _setupScrollBlocker() {
    this._initialScrollTarget = null
    this._scrollTimerID = null

    document.addEventListener('wheel', (event: WheelEvent) => {
      if (this._scrollTimerID) {
        clearTimeout(this._scrollTimerID)
      }
      if (!this._initialScrollTarget) {
        this._initialScrollTarget = event.target as EventTarget
      }
      this._scrollTimerID = window.setTimeout(() => {
        this._initialScrollTarget = null
      }, 100)
    })
  }

  private _shouldBlockScroll(event: WheelEvent): boolean {
    void event
    return !!(
      this._initialScrollTarget && this._initialScrollTarget !== this.canvas
    )
  }

  // -- Canvas size ---------------------------------------------------------

  get canvasWidth(): number {
    const rect = this.canvas.parentElement?.getBoundingClientRect()
    return rect?.width ?? 0
  }

  get canvasHeight(): number {
    const rect = this.canvas.parentElement?.getBoundingClientRect()
    return rect?.height ?? 0
  }

  get devicePixelRatio(): number {
    return window.devicePixelRatio
  }

  setupSize() {
    const width = this.canvasWidth
    const height = this.canvasHeight
    const scale = this.devicePixelRatio

    this.canvas.width = Math.floor(width * scale)
    this.canvas.height = Math.floor(height * scale)
    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'

    const parentOffsetX = this.canvas.parentElement?.offsetLeft ?? 0
    const parentOffsetY = this.canvas.parentElement?.offsetTop ?? 0

    if (this._previousOffsets) {
      // Compensate for parent element movement to keep visual position stable
      const dx = this._previousOffsets.parentOffsetX - parentOffsetX
      const dy = this._previousOffsets.parentOffsetY - parentOffsetY
      this._viewport.pan.x += dx
      this._viewport.pan.y += dy
    }
    this._previousOffsets = { parentOffsetX, parentOffsetY }
    this._notifyViewportChange()
  }

  // -- Rendering -----------------------------------------------------------

  draw() {
    const scale = this.devicePixelRatio
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)

    if (!this.sceneView) {
      console.log('No sceneView to draw')
      return
    }

    if (!this.sceneModel) {
      console.log('No sceneModel to draw')
      return
    }

    try {
      withSavedState(this.context, () => {
        this.context.scale(scale, scale)
        this.context.translate(this._originX, this._originY)
        this.context.scale(this._viewport.zoom, -this._viewport.zoom)
        this.sceneView!.draw(this, this.sceneModel!)
      })
    } catch (error) {
      console.error('Error in draw:', error)
      throw error
    }
  }

  requestUpdate() {
    if (this._updateRequested) {
      return
    }
    this._updateRequested = true
    requestAnimationFrame(() => {
      this._updateRequested = false
      this.draw()
    })
  }

  // -- Event handlers ------------------------------------------------------

  handleWheel(event: WheelEvent) {
    event.preventDefault()

    if (this._shouldBlockScroll(event)) {
      return
    }

    const { deltaX, deltaY } = event

    // Detect "clunky" scroll wheel
    const clunkyScrollWheel =
      Math.abs(deltaY) > 50 &&
      Math.abs(
        (event as WheelEvent & { wheelDeltaY: number }).wheelDeltaY / deltaY
      ) < 2

    if (event.ctrlKey || event.altKey) {
      const scaleDown = clunkyScrollWheel ? 500 : event.ctrlKey ? 100 : 300
      this._doPinchMagnify(event, 1 - deltaY / scaleDown)
    } else {
      const scaleDown = clunkyScrollWheel ? 3 : 1
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this._viewport.pan.x -= deltaX / scaleDown
      } else {
        this._viewport.pan[event.shiftKey ? 'x' : 'y'] -= deltaY / scaleDown
      }
      this.requestUpdate()
      this._notifyViewportChange()
    }
  }

  handleSafariGestureStart(event: Event) {
    event.preventDefault()
    const gestureEvent = event as unknown as { scale: number }
    this._initialZoom = this._viewport.zoom
    this._doPinchMagnify(
      gestureEvent as unknown as MouseEvent,
      gestureEvent.scale
    )
  }

  handleSafariGestureChange(event: Event) {
    event.preventDefault()
    const gestureEvent = event as unknown as { scale: number }
    const zoomFactor =
      (this._initialZoom * gestureEvent.scale) / this._viewport.zoom
    this._doPinchMagnify(gestureEvent as unknown as MouseEvent, zoomFactor)
  }

  handleSafariGestureEnd(event: Event) {
    event.preventDefault()
    this._initialZoom = 0
  }

  private _doPinchMagnify(
    event: { pageX: number; pageY: number },
    zoomFactor: number
  ) {
    const center = this.localPoint({ x: event.pageX, y: event.pageY })
    const prevZoom = this._viewport.zoom

    let newZoom = prevZoom * zoomFactor
    newZoom = clampZoom(newZoom)
    zoomFactor = newZoom / prevZoom

    this._viewport.zoom = newZoom
    // Adjust pan so the point under the cursor stays fixed
    this._viewport.pan.x += (1 - zoomFactor) * center.x * prevZoom
    this._viewport.pan.y -= (1 - zoomFactor) * center.y * prevZoom

    this.requestUpdate()
    this._notifyViewportChange()
  }

  // -- Coordinate transformation -------------------------------------------

  localPoint(event: Point): Point {
    const x =
      (event.x -
        (this.canvas.parentElement?.offsetLeft ?? 0) -
        this._originX) /
      this._viewport.zoom
    const y =
      -(event.y -
        (this.canvas.parentElement?.offsetTop ?? 0) -
        this._originY) /
      this._viewport.zoom

    return { x, y }
  }

  canvasPoint(point: Point): Point {
    const x = point.x * this._viewport.zoom + this._originX
    const y = -point.y * this._viewport.zoom + this._originY
    return { x, y }
  }

  get onePixelUnit(): number {
    return 1 / this._viewport.zoom
  }

  getViewBox(): Rect {
    const width = this.canvasWidth
    const height = this.canvasHeight
    const left = this.canvas.parentElement?.offsetLeft ?? 0
    const top = this.canvas.parentElement?.offsetTop ?? 0

    const bottomLeft = this.localPoint({ x: 0 + left, y: 0 + top })
    const topRight = this.localPoint({ x: width + left, y: height + top })

    return normalizeRect({
      xMin: bottomLeft.x,
      yMin: bottomLeft.y,
      xMax: topRight.x,
      yMax: topRight.y,
    })
  }

  // -- Internal helpers ----------------------------------------------------

  private _computeFitZoom(viewBox: Rect): number {
    const validated = validateRect(viewBox)
    const width = this.canvasWidth
    const height = this.canvasHeight

    const magnificationX = Math.abs(width / (validated.xMax - validated.xMin))
    const magnificationY = Math.abs(height / (validated.yMax - validated.yMin))
    return Math.min(magnificationX, magnificationY)
  }

  private _notifyViewportChange() {
    this.onViewportChange?.(this._viewport)
  }

  destroy() {
    this._resizeObserver?.disconnect()
    if (this._scrollTimerID) {
      clearTimeout(this._scrollTimerID)
    }
  }
}

// Utility functions

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_MAGNIFICATION), MAX_MAGNIFICATION)
}

export function withSavedState<T>(
  context: CanvasRenderingContext2D,
  func: () => T
): T {
  context.save()
  try {
    return func()
  } finally {
    context.restore()
  }
}

function normalizeRect(rect: Rect): Rect {
  return {
    xMin: Math.min(rect.xMin, rect.xMax),
    yMin: Math.min(rect.yMin, rect.yMax),
    xMax: Math.max(rect.xMin, rect.xMax),
    yMax: Math.max(rect.yMin, rect.yMax),
  }
}

function validateRect(rect: Rect): Rect {
  if (
    !Number.isFinite(rect.xMin) ||
    !Number.isFinite(rect.yMin) ||
    !Number.isFinite(rect.xMax) ||
    !Number.isFinite(rect.yMax)
  ) {
    throw new Error('Invalid rect')
  }
  return rect
}

function rectCenter(rect: Rect): Point {
  return {
    x: (rect.xMin + rect.xMax) / 2,
    y: (rect.yMin + rect.yMax) / 2,
  }
}
