import {
  glyphSelector,
  registerVisualizationLayerDefinition,
} from '@/sceneView/SceneView'
import type { CanvasController } from '@/sceneView/CanvasController'
import type { PositionedGlyph, SceneModel } from '@/sceneView/SceneView'

function screenLength(canvasController: CanvasController, value: number) {
  return value / canvasController.magnification
}

function drawCross(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  context.beginPath()
  context.moveTo(x - size, y)
  context.lineTo(x + size, y)
  context.moveTo(x, y - size)
  context.lineTo(x, y + size)
  context.stroke()
}

function drawLabel(
  canvasController: CanvasController,
  x: number,
  y: number,
  text: string,
  parameters: Record<string, number | number[] | string>
) {
  const context = canvasController.context
  const fontSize = screenLength(canvasController, parameters.fontSize as number)

  context.save()
  context.scale(1, -1)
  context.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = parameters.labelColor as string
  context.fillText(text, x, -y)
  context.restore()
}

function formatMetric(value: number) {
  return String(Math.round(value))
}

function getDescender(model: SceneModel) {
  return model.lineMetricsHorizontalLayout?.descender?.value ?? -220
}

function getLabelY(
  canvasController: CanvasController,
  model: SceneModel,
  parameters: Record<string, number | number[] | string>
) {
  return (
    getDescender(model) -
    screenLength(canvasController, parameters.labelOffset as number)
  )
}

function getWidthLabelX(positionedGlyph: PositionedGlyph) {
  return positionedGlyph.glyph.xAdvance / 2
}

registerVisualizationLayerDefinition({
  identifier: 'main.textMetricsOverlay',
  name: 'Text Metrics Overlay',
  selectionFunc: glyphSelector('all'),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 555,
  screenParameters: {
    strokeWidth: 1,
    crossSize: 4,
    fontSize: 10,
    labelOffset: 24,
  },
  colors: {
    markerColor: '#8F969E7A',
    labelColor: '#6F7780B8',
    kernColor: '#6F7780D9',
  },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (model.activeToolIdentifier !== 'text') {
      return
    }

    const context = canvasController.context
    const glyph = positionedGlyph.glyph
    const descender = getDescender(model)
    const crossSize = screenLength(
      canvasController,
      parameters.crossSize as number
    )

    context.save()
    context.strokeStyle = parameters.markerColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    drawCross(context, 0, 0, crossSize)
    drawCross(context, glyph.xAdvance, 0, crossSize)
    drawCross(context, 0, descender, crossSize)
    drawCross(context, glyph.xAdvance, descender, crossSize)
    context.restore()

    const labelY = getLabelY(canvasController, model, parameters)
    const metrics = glyph.metrics

    const kernValue = positionedGlyph.glyph.kerningWithPrevious ?? 0
    if (kernValue < 0) {
      const overlapWidth = Math.abs(kernValue)
      const overlapCenter = overlapWidth / 2
      drawLabel(
        canvasController,
        overlapCenter,
        labelY,
        formatMetric(kernValue),
        {
          ...parameters,
          labelColor: parameters.kernColor,
        }
      )
    }

    drawLabel(
      canvasController,
      getWidthLabelX(positionedGlyph),
      labelY,
      formatMetric(metrics?.width ?? glyph.xAdvance),
      parameters
    )
  },
})
