// Power ruler: live distance readout along a measuring line through the glyph.

import {
  registerVisualizationLayerDefinition,
  glyphSelector,
} from '@/sceneView/SceneView'
import type { PositionedGlyph, SceneModel } from '@/sceneView/SceneView'
import type { CanvasController } from '@/sceneView/CanvasController'
import {
  computeRuler,
  glyphRulerSegments,
  type RulerGuideLine,
  type RulerMeasurePoint,
} from '@/font/powerRuler'

function isHandTool(model: SceneModel) {
  return model.activeToolIdentifier === 'hand'
}

function screenLength(canvasController: CanvasController, value: number) {
  return value / canvasController.magnification
}

registerVisualizationLayerDefinition({
  identifier: 'main.power.ruler',
  name: 'Power Ruler',
  selectionFunc: glyphSelector('editing'),
  zIndex: 600,
  screenParameters: {
    strokeWidth: 1,
    fontSize: 11,
    intersectionRadius: 3.5,
    labelPaddingX: 6,
    labelPaddingY: 3,
    labelRadius: 4,
  },
  colors: {
    strokeColor: '#00000066',
    intersectionColor: '#F08055',
    insideLabelBackground: '#1A1A1AE6',
    insideLabelText: '#FFFFFFF2',
    outsideLabelBackground: '#FFFFFFE6',
    outsideLabelText: '#1A1A1A',
  },
  colorsDarkMode: {
    strokeColor: '#FFFFFF66',
    intersectionColor: '#F08055',
    insideLabelBackground: '#FFFFFFE6',
    insideLabelText: '#1A1A1A',
    outsideLabelBackground: '#1A1A1AE6',
    outsideLabelText: '#FFFFFFF2',
  },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (isHandTool(model) || !model.powerRuler) {
      return
    }

    const glyph = positionedGlyph.glyph
    const { basePoint, directionVector } = model.powerRuler
    const guideLines: RulerGuideLine[] = [
      { axis: 'x', value: 0 },
      { axis: 'x', value: glyph.xAdvance },
    ]

    const { intersections, measurePoints } = computeRuler(
      glyphRulerSegments(glyph.path),
      basePoint,
      directionVector,
      guideLines
    )
    if (intersections.length < 2) {
      return
    }

    const context = canvasController.context
    const first = intersections[0]
    const last = intersections[intersections.length - 1]

    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )
    context.beginPath()
    context.moveTo(first.x, first.y)
    context.lineTo(last.x, last.y)
    context.stroke()

    context.fillStyle = parameters.intersectionColor as string
    const radius = screenLength(
      canvasController,
      parameters.intersectionRadius as number
    )
    for (const intersection of intersections) {
      context.beginPath()
      context.arc(intersection.x, intersection.y, radius, 0, 2 * Math.PI)
      context.fill()
    }

    for (const measurePoint of measurePoints) {
      drawDistanceLabel(canvasController, measurePoint, parameters)
    }
  },
})

function drawDistanceLabel(
  canvasController: CanvasController,
  measurePoint: RulerMeasurePoint,
  parameters: Record<string, number | number[] | string>
) {
  const context = canvasController.context
  const fontSize = screenLength(canvasController, parameters.fontSize as number)
  const paddingX = screenLength(
    canvasController,
    parameters.labelPaddingX as number
  )
  const paddingY = screenLength(
    canvasController,
    parameters.labelPaddingY as number
  )
  const radius = screenLength(
    canvasController,
    parameters.labelRadius as number
  )

  context.save()
  context.scale(1, -1)
  context.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const text = String(measurePoint.distance)
  const labelY = -measurePoint.y
  const width = context.measureText(text).width + paddingX * 2
  const height = fontSize + paddingY * 2
  const boxX = measurePoint.x - width / 2
  const boxY = labelY - height / 2

  context.fillStyle = (
    measurePoint.inside
      ? parameters.insideLabelBackground
      : parameters.outsideLabelBackground
  ) as string
  context.beginPath()
  if (context.roundRect) {
    context.roundRect(boxX, boxY, width, height, radius)
  } else {
    context.rect(boxX, boxY, width, height)
  }
  context.fill()

  context.fillStyle = (
    measurePoint.inside
      ? parameters.insideLabelText
      : parameters.outsideLabelText
  ) as string
  context.fillText(text, measurePoint.x, labelY)
  context.restore()
}
