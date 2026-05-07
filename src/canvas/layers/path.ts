// 路徑和節點繪製圖層

import {
  registerVisualizationLayerDefinition,
  glyphSelector,
} from 'src/canvas/SceneView'
import type { Point, PositionedGlyph, SceneModel } from 'src/canvas/SceneView'
import type { CanvasController } from 'src/canvas/CanvasController'

function strokeLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

function isHandTool(model: SceneModel) {
  return model.activeToolIdentifier === 'hand'
}

function screenLength(canvasController: CanvasController, value: number) {
  return value / canvasController.magnification
}

function screenArray(canvasController: CanvasController, values: number[]) {
  return values.map((value) => screenLength(canvasController, value))
}

// 編輯路徑填充
registerVisualizationLayerDefinition({
  identifier: 'main.context.path.fill',
  name: 'Context Path Fill',
  selectionFunc: glyphSelector('notediting'),
  zIndex: 450,
  colors: { fillColor: '#080B0D' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>
  ) => {
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path) return

    context.fillStyle = parameters.fillColor as string
    for (const component of glyph.components || []) {
      if (component.path2d) {
        context.fill(component.path2d)
      }
    }
    context.fill(glyph.path.toPath2D())
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.edit.path.fill',
  name: 'Path Fill',
  selectionFunc: glyphSelector('editing'),
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { fillColor: '#080B0D14' },
  colorsDarkMode: { fillColor: '#FFF3' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path) return

    context.fillStyle = isHandTool(model)
      ? '#080B0D'
      : (parameters.fillColor as string)
    for (const component of glyph.components || []) {
      if (component.path2d) {
        context.fill(component.path2d)
      }
    }
    context.fill(glyph.path.toPath2D())
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.edit.empty.placeholder',
  name: 'Empty Glyph Placeholder',
  selectionFunc: glyphSelector('editing'),
  zIndex: 499,
  colors: { fillColor: 'rgba(102, 112, 100, 0.2)' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (
      isHandTool(model) ||
      !positionedGlyph.isEmpty ||
      !positionedGlyph.displayCharacter
    ) {
      return
    }

    const context = canvasController.context
    context.save()
    context.scale(1, -1)
    context.fillStyle = parameters.fillColor as string
    context.font = `${screenLength(canvasController, 250)}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(
      positionedGlyph.displayCharacter,
      positionedGlyph.glyph.xAdvance / 2,
      -280
    )
    context.restore()
  },
})

// 路徑輪廓
registerVisualizationLayerDefinition({
  identifier: 'main.path.stroke',
  name: 'Path Stroke',
  selectionFunc: glyphSelector('editing'),
  zIndex: 500,
  screenParameters: { strokeWidth: 2 },
  colors: { strokeColor: '#080B0D' },
  colorsDarkMode: { strokeColor: '#FFF' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path) return

    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    for (const component of glyph.components || []) {
      if (component.path2d) {
        context.stroke(component.path2d)
      }
    }
    context.stroke(glyph.path.toPath2D())
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.connect-insert.point',
  name: 'Connect/Insert Point',
  selectionFunc: glyphSelector('editing'),
  zIndex: 545,
  screenParameters: {
    connectRadius: 7,
    insertHandlesRadius: 3.5,
    strokeWidth: 2,
  },
  colors: { color: '#25DAF299', closeColor: '#FF604FAA' },
  colorsDarkMode: { color: '#50A0FF80', closeColor: '#fc818199' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const targetPoint = model.pathConnectTargetPoint
    const insertHandles = model.pathInsertHandles
    if (!targetPoint && !insertHandles) {
      return
    }

    const context = canvasController.context
    const color =
      targetPoint?.kind === 'close'
        ? (parameters.closeColor as string)
        : (parameters.color as string)

    context.fillStyle = color
    context.strokeStyle = color
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.lineCap = 'round'

    if (targetPoint) {
      fillRoundNode(
        context,
        targetPoint,
        screenLength(canvasController, (parameters.connectRadius as number) * 2)
      )
    }
    for (const point of insertHandles?.points || []) {
      fillRoundNode(
        context,
        point,
        screenLength(
          canvasController,
          (parameters.insertHandlesRadius as number) * 2
        )
      )
    }
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.pen.preview',
  name: 'Pen Preview',
  selectionFunc: glyphSelector('editing'),
  zIndex: 546,
  screenParameters: { strokeWidth: 2, lineDash: [6, 4] },
  colors: { strokeColor: '#00AFC9' },
  colorsDarkMode: { strokeColor: '#81e6d9' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    if (!model.penPreviewPath) {
      return
    }

    const context = canvasController.context
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.setLineDash(
      screenArray(canvasController, parameters.lineDash as number[])
    )
    context.stroke(model.penPreviewPath)
    context.setLineDash([])
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.shape.preview',
  name: 'Shape Preview',
  selectionFunc: glyphSelector('editing'),
  zIndex: 546,
  screenParameters: { strokeWidth: 2, lineDash: [8, 5] },
  colors: { strokeColor: '#00AFC9', fillColor: '#25DAF214' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model) || !model.shapePreviewPath) {
      return
    }

    const context = canvasController.context
    context.fillStyle = parameters.fillColor as string
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.setLineDash(
      screenArray(canvasController, parameters.lineDash as number[])
    )
    context.fill(model.shapePreviewPath)
    context.stroke(model.shapePreviewPath)
    context.setLineDash([])
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.knife.preview',
  name: 'Knife Preview',
  selectionFunc: glyphSelector('editing'),
  zIndex: 546,
  screenParameters: { strokeWidth: 1.5, nodeSize: 7 },
  colors: { strokeColor: '#FF604F', nodeColor: '#F7EB40' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model) || !model.knifeLine) {
      return
    }

    const context = canvasController.context
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    strokeLine(
      context,
      model.knifeLine.x1,
      model.knifeLine.y1,
      model.knifeLine.x2,
      model.knifeLine.y2
    )

    context.fillStyle = parameters.nodeColor as string
    const nodeSize = screenLength(
      canvasController,
      parameters.nodeSize as number
    )
    for (const point of model.knifeLine.intersections) {
      fillRoundNode(context, point, nodeSize)
    }
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.alignment.guides',
  name: 'Alignment Guides',
  selectionFunc: glyphSelector('editing'),
  zIndex: 547,
  screenParameters: { strokeWidth: 1.25, lineDash: [5, 5] },
  colors: { strokeColor: '#E8D619' },
  colorsDarkMode: { strokeColor: '#f6ad55' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    if (!model.alignmentGuides?.length) {
      return
    }

    const context = canvasController.context
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.setLineDash(
      screenArray(canvasController, parameters.lineDash as number[])
    )
    for (const guide of model.alignmentGuides) {
      strokeLine(context, guide.x1, guide.y1, guide.x2, guide.y2)
    }
    context.setLineDash([])
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.selection.transform',
  name: 'Selection Transform Handles',
  selectionFunc: glyphSelector('editing'),
  zIndex: 549,
  screenParameters: { strokeWidth: 1, handleSize: 8, lineDash: [6, 4] },
  colors: { strokeColor: '#9CA3AF', handleFill: '#F8F8F8' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model) || !model.selectionTransformBounds) {
      return
    }

    const { xMin, yMin, xMax, yMax, handles } = model.selectionTransformBounds
    const context = canvasController.context
    const handleSize = screenLength(
      canvasController,
      parameters.handleSize as number
    )

    context.strokeStyle = parameters.strokeColor as string
    context.fillStyle = parameters.handleFill as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.setLineDash(
      screenArray(canvasController, parameters.lineDash as number[])
    )
    context.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin)
    context.setLineDash([])

    for (const handle of handles) {
      context.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      )
      context.strokeRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      )
    }
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.text.cursor',
  name: 'Text Cursor',
  selectionFunc: (visContext) => {
    const glyphs = visContext.glyphsBySelectionMode.all || []
    return glyphs.length > 0 ? [glyphs[0]] : []
  },
  zIndex: 548,
  screenParameters: { strokeWidth: 2 },
  colors: { strokeColor: '#00AFC9' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (model.activeToolIdentifier !== 'text' || !model.textCursor) {
      return
    }

    const context = canvasController.context
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    strokeLine(
      context,
      model.textCursor.x,
      model.textCursor.yMin,
      model.textCursor.x,
      model.textCursor.yMax
    )
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.selected.segments',
  name: 'Selected Segments',
  selectionFunc: glyphSelector('editing'),
  zIndex: 540,
  screenParameters: { strokeWidth: 4 },
  colors: {
    selectedColor: '#F7EB40',
    hoveredColor: '#25DAF2',
  },
  colorsDarkMode: {
    selectedColor: '#90cdf4',
    hoveredColor: '#90cdf4',
  },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path?.iterContourSegments) return

    const selectedSegmentKey = model.selectedPathHit?.segment.key
    const selectedPointIndices = expandSelectionForDisplay(
      glyph.path,
      new Set(parseSelection(model.selection || new Set()))
    )

    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )

    for (
      let contourIndex = 0;
      contourIndex < glyph.path.numContours;
      contourIndex += 1
    ) {
      for (const segment of glyph.path.iterContourSegments(contourIndex)) {
        const segmentKey = `${contourIndex}:${segment.pointIndices.join('-')}`
        const isSelected =
          selectedSegmentKey === segmentKey ||
          segment.pointIndices.every((index) => selectedPointIndices.has(index))
        if (!isSelected) {
          continue
        }
        context.strokeStyle = parameters.selectedColor as string
        strokeSegment(context, segment.points)
      }
    }
  },
})

// 控制杆 (Bezier handles)
registerVisualizationLayerDefinition({
  identifier: 'main.handles',
  name: 'Bezier Handles',
  selectionFunc: glyphSelector('editing'),
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { color: '#BFC7BA' },
  colorsDarkMode: { color: '#777' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path?.iterHandles) return

    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    const selectedPointIndices = expandSelectionForDisplay(
      glyph.path,
      new Set(parseSelection(model.selection || new Set()))
    )
    const hoveredPointIndices = new Set(
      parseSelection(model.hoverSelection || new Set())
    )

    for (const [pt1, pt2] of glyph.path.iterHandles()) {
      const handleIndices = findHandleIndices(glyph.path, pt1, pt2)
      context.strokeStyle = handleIndices.some((index) =>
        selectedPointIndices.has(index)
      )
        ? '#F7EB40'
        : handleIndices.some((index) => hoveredPointIndices.has(index))
          ? '#25DAF2'
          : (parameters.color as string)
      strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y)
    }
  },
})

// 節點
registerVisualizationLayerDefinition({
  identifier: 'main.nodes',
  name: 'Nodes',
  selectionFunc: glyphSelector('editing'),
  zIndex: 500,
  screenParameters: { cornerSize: 8, smoothSize: 8, handleSize: 6.5 },
  colors: { color: '#BFC7BA' },
  colorsDarkMode: { color: '#BBB' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path?.iterPoints) return

    const cornerSize = screenLength(
      canvasController,
      parameters.cornerSize as number
    )
    const smoothSize = screenLength(
      canvasController,
      parameters.smoothSize as number
    )
    const handleSize = screenLength(
      canvasController,
      parameters.handleSize as number
    )

    context.fillStyle = parameters.color as string
    for (const pt of glyph.path.iterPoints()) {
      fillNode(context, pt, cornerSize, smoothSize, handleSize)
    }
  },
})

// 選中的節點
registerVisualizationLayerDefinition({
  identifier: 'main.selected.nodes',
  name: 'Selected Nodes',
  selectionFunc: glyphSelector('editing'),
  zIndex: 600,
  screenParameters: {
    cornerSize: 8,
    smoothSize: 8,
    handleSize: 6.5,
    strokeWidth: 1,
    hoverStrokeOffset: 4,
    underlayOffset: 2,
  },
  colors: {
    hoveredColor: '#25DAF2',
    selectedColor: '#080B0D',
    underColor: '#F7EB40',
  },
  colorsDarkMode: {
    hoveredColor: '#BBB',
    selectedColor: '#FFF',
    underColor: '#0008',
  },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path?.iterPoints) return

    const cornerSize = screenLength(
      canvasController,
      parameters.cornerSize as number
    )
    const smoothSize = screenLength(
      canvasController,
      parameters.smoothSize as number
    )
    const handleSize = screenLength(
      canvasController,
      parameters.handleSize as number
    )
    const underlayOffset = screenLength(
      canvasController,
      parameters.underlayOffset as number
    )

    const selectedPointIndices = Array.from(
      expandSelectionForDisplay(
        glyph.path,
        new Set(parseSelection(model.selection || new Set()))
      )
    )
    const hoveredPointIndices = parseSelection(
      model.hoverSelection || new Set()
    )

    // Draw underlay (white background)
    context.fillStyle = parameters.underColor as string
    for (const idx of selectedPointIndices) {
      const pt = getPointByIndex(glyph.path, idx)
      if (pt) {
        fillNode(
          context,
          pt,
          cornerSize + underlayOffset,
          smoothSize + underlayOffset,
          handleSize + underlayOffset
        )
      }
    }

    // Draw selected nodes
    context.fillStyle = parameters.selectedColor as string
    for (const idx of selectedPointIndices) {
      const pt = getPointByIndex(glyph.path, idx)
      if (pt) {
        fillNode(context, pt, cornerSize, smoothSize, handleSize)
      }
    }

    // Draw hovered nodes
    context.fillStyle = parameters.hoveredColor as string
    for (const idx of hoveredPointIndices) {
      if (selectedPointIndices.includes(idx)) {
        continue
      }
      const pt = getPointByIndex(glyph.path, idx)
      if (pt) {
        fillNode(context, pt, cornerSize, smoothSize, handleSize)
      }
    }
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.start.direction.nodes',
  name: 'Path Start Direction Nodes',
  selectionFunc: glyphSelector('editing'),
  zIndex: 650,
  screenParameters: { arrowSize: 15, underlayOffset: 3 },
  colors: { color: '#16A34A', underColor: '#FFFFFF' },
  colorsDarkMode: { color: '#22C55E', underColor: '#0008' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model)) {
      return
    }
    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    if (!glyph.path?.getPoint) return

    const arrowSize = screenLength(
      canvasController,
      parameters.arrowSize as number
    )
    const underlayOffset = screenLength(
      canvasController,
      parameters.underlayOffset as number
    )
    const startDirections = buildStartDirectionByIndex(glyph.path)

    context.fillStyle = parameters.underColor as string
    for (const [startIndex, directionPoint] of startDirections) {
      const startPoint = glyph.path.getPoint(startIndex)
      if (startPoint) {
        fillStartDirectionNode(
          context,
          startPoint,
          directionPoint,
          arrowSize + underlayOffset
        )
      }
    }

    context.fillStyle = parameters.color as string
    for (const [startIndex, directionPoint] of startDirections) {
      const startPoint = glyph.path.getPoint(startIndex)
      if (startPoint) {
        fillStartDirectionNode(context, startPoint, directionPoint, arrowSize)
      }
    }
  },
})

// 游標十字線
registerVisualizationLayerDefinition({
  identifier: 'main.crosshair',
  name: 'Crosshair',
  selectionFunc: glyphSelector('editing'),
  userSwitchable: true,
  defaultOn: false,
  zIndex: 700,
  screenParameters: { strokeWidth: 1, lineDash: [4, 4] },
  colors: { strokeColor: '#E8D619AA' },
  colorsDarkMode: { strokeColor: '#AAA8' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel,
    controller: CanvasController
  ) => {
    if (isHandTool(model)) {
      return
    }
    if (model.initialClickedPointIndex === undefined) return

    const glyph = positionedGlyph.glyph
    const pt = getPointByIndex(glyph.path, model.initialClickedPointIndex)
    if (!pt) return

    const context = canvasController.context
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.setLineDash(
      screenArray(canvasController, parameters.lineDash as number[])
    )

    const { xMin, yMin, xMax, yMax } = controller.getViewBox()

    strokeLine(context, pt.x, yMin, pt.x, yMax)
    strokeLine(context, xMin, pt.y, xMax, pt.y)

    context.setLineDash([])
  },
})

registerVisualizationLayerDefinition({
  identifier: 'main.selection.rect',
  name: 'Selection Rect',
  selectionFunc: glyphSelector('editing'),
  zIndex: 800,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: '#00AFC9', fillColor: '#25DAF22E' },
  colorsDarkMode: { strokeColor: '#90cdf4', fillColor: '#90cdf433' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (
      isHandTool(model) ||
      !model.selectionRect ||
      model.selectionRect.owner !== 'pointer' ||
      model.activeToolIdentifier !== 'pointer'
    ) {
      return
    }
    const rect = model.selectionRect
    const context = canvasController.context
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.strokeStyle = parameters.strokeColor as string
    context.fillStyle = parameters.fillColor as string
    context.beginPath()
    context.rect(
      rect.xMin,
      rect.yMin,
      rect.xMax - rect.xMin,
      rect.yMax - rect.yMin
    )
    context.fill()
    context.stroke()
  },
})

// Helper functions

function fillNode(
  context: CanvasRenderingContext2D,
  pt: Point,
  cornerSize: number,
  smoothSize: number,
  handleSize: number
) {
  const size =
    pt.type === 'onCurve' ? (pt.smooth ? smoothSize : cornerSize) : handleSize

  context.beginPath()

  if (pt.type === 'onCurve') {
    if (pt.smooth) {
      // Circle for smooth on-curve points
      context.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2)
    } else {
      // Square for corner on-curve points
      context.rect(pt.x - size / 2, pt.y - size / 2, size, size)
    }
  } else {
    // Diamond for off-curve points
    context.moveTo(pt.x, pt.y - size / 2)
    context.lineTo(pt.x + size / 2, pt.y)
    context.lineTo(pt.x, pt.y + size / 2)
    context.lineTo(pt.x - size / 2, pt.y)
    context.closePath()
  }

  context.fill()
}

function fillStartDirectionNode(
  context: CanvasRenderingContext2D,
  pt: Point,
  directionPoint: Point,
  size: number
) {
  const dx = directionPoint.x - pt.x
  const dy = directionPoint.y - pt.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const tipDistance = size * 0.62
  const baseDistance = size * 0.38
  const halfBase = size * 0.48

  context.moveTo(pt.x + ux * tipDistance, pt.y + uy * tipDistance)
  context.lineTo(
    pt.x - ux * baseDistance + px * halfBase,
    pt.y - uy * baseDistance + py * halfBase
  )
  context.lineTo(
    pt.x - ux * baseDistance - px * halfBase,
    pt.y - uy * baseDistance - py * halfBase
  )
  context.closePath()
  context.fill()
}

function fillRoundNode(
  context: CanvasRenderingContext2D,
  pt: { x: number; y: number },
  size: number
) {
  context.beginPath()
  context.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2)
  context.fill()
}

function strokeSegment(context: CanvasRenderingContext2D, points: Point[]) {
  if (points.length < 2) {
    return
  }

  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y)
  } else if (points.length === 3) {
    context.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y)
  } else if (points.length >= 4) {
    context.bezierCurveTo(
      points[1].x,
      points[1].y,
      points[2].x,
      points[2].y,
      points[3].x,
      points[3].y
    )
  }
  context.stroke()
}

function parseSelection(selection: Set<string>): number[] {
  const indices: number[] = []
  for (const item of selection) {
    const match = item.match(/^point\/(\d+)$/)
    if (match) {
      indices.push(parseInt(match[1], 10))
    }
  }
  return indices
}

function getPointByIndex(
  path: { iterPoints(): Generator<Point & { index: number }, void> },
  index: number
): Point | null {
  for (const pt of path.iterPoints()) {
    if (pt.index === index) {
      return pt
    }
  }
  return null
}

function buildStartDirectionByIndex(path: {
  getPoint?(index: number): Point
  contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
}) {
  const directions = new Map<number, Point>()
  if (!path.getPoint || !path.contourInfo?.length) {
    return directions
  }

  let start = 0
  for (const contour of path.contourInfo) {
    const startPoint = path.getPoint(start)
    if (startPoint?.type === 'onCurve') {
      const directionPoint = findNextDistinctPoint(
        path,
        start,
        contour.endPoint
      )
      if (directionPoint) {
        directions.set(start, directionPoint)
      }
    }
    start = contour.endPoint + 1
  }

  return directions
}

function findNextDistinctPoint(
  path: { getPoint?(index: number): Point },
  startIndex: number,
  endIndex: number
) {
  const startPoint = path.getPoint?.(startIndex)
  if (!startPoint) {
    return null
  }

  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const point = path.getPoint?.(index)
    if (!point) {
      continue
    }

    if (point.x !== startPoint.x || point.y !== startPoint.y) {
      return point
    }
  }

  return null
}

function findHandleIndices(
  path: { iterPoints(): Generator<Point & { index: number }, void> },
  pt1: Point,
  pt2: Point
): number[] {
  const indices: number[] = []
  for (const point of path.iterPoints()) {
    if (
      (point.x === pt1.x && point.y === pt1.y) ||
      (point.x === pt2.x && point.y === pt2.y)
    ) {
      indices.push(point.index)
    }
  }
  return indices
}

function expandSelectionForDisplay(
  path: {
    getPoint?(index: number): Point
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
  },
  selection: Set<number>
): Set<number> {
  if (!path.getPoint || !path.contourInfo?.length) {
    return selection
  }

  const expanded = new Set(selection)
  for (const index of selection) {
    const point = path.getPoint(index)
    if (!point || point.type !== 'onCurve') {
      continue
    }
    for (const attachedIndex of findAttachedHandleIndices(path, index)) {
      expanded.add(attachedIndex)
    }
  }
  return expanded
}

function findAttachedHandleIndices(
  path: {
    getPoint?(index: number): Point
    contourInfo?: Array<{ endPoint: number; isClosed?: boolean }>
  },
  pointIndex: number
): number[] {
  if (!path.getPoint || !path.contourInfo?.length) {
    return []
  }

  const contourBounds = findContourBounds(path.contourInfo, pointIndex)
  if (!contourBounds) {
    return []
  }

  const attached = new Set<number>()
  collectHandleRun(path, pointIndex, -1, contourBounds, attached)
  collectHandleRun(path, pointIndex, 1, contourBounds, attached)
  return [...attached]
}

function collectHandleRun(
  path: { getPoint?(index: number): Point },
  startIndex: number,
  direction: -1 | 1,
  contourBounds: { start: number; end: number; isClosed: boolean },
  attached: Set<number>
) {
  if (!path.getPoint) {
    return
  }

  let currentIndex = startIndex
  while (true) {
    currentIndex += direction
    if (
      currentIndex < contourBounds.start ||
      currentIndex > contourBounds.end
    ) {
      if (!contourBounds.isClosed) {
        return
      }
      currentIndex = direction > 0 ? contourBounds.start : contourBounds.end
    }

    if (currentIndex === startIndex) {
      return
    }

    const point = path.getPoint(currentIndex)
    if (!point || point.type === 'onCurve') {
      return
    }

    attached.add(currentIndex)
  }
}

function findContourBounds(
  contourInfo: Array<{ endPoint: number; isClosed?: boolean }>,
  pointIndex: number
): { start: number; end: number; isClosed: boolean } | null {
  let start = 0
  for (const contour of contourInfo) {
    if (pointIndex <= contour.endPoint) {
      return {
        start,
        end: contour.endPoint,
        isClosed: contour.isClosed ?? true,
      }
    }
    start = contour.endPoint + 1
  }
  return null
}
