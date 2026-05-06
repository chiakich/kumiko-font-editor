// 基線和字體度量圖層

import {
  registerVisualizationLayerDefinition,
  glyphSelector,
} from '../SceneView'
import type { PositionedGlyph, SceneModel } from '../SceneView'
import type { CanvasController } from '../CanvasController'

type LineMetric = {
  value: number
  zone?: number
}

type LineMetrics = Record<string, LineMetric>

const DEFAULT_LINE_METRICS: LineMetrics = {
  ascender: { value: 800, zone: 16 },
  capHeight: { value: 700, zone: 16 },
  xHeight: { value: 500, zone: 16 },
  baseline: { value: 0, zone: -16 },
  descender: { value: -200, zone: -16 },
}

const LINE_METRIC_LABELS: Record<string, string> = {
  ascender: 'Asc',
  capHeight: 'Cap',
  xHeight: 'xH',
  baseline: 'Base',
  descender: 'Desc',
}

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

function screenLength(canvasController: CanvasController, value: number) {
  return value / canvasController.magnification
}

function getLineMetrics(model: SceneModel): LineMetrics {
  return {
    ...DEFAULT_LINE_METRICS,
    ...(model.lineMetricsHorizontalLayout ?? {}),
  }
}

function getSortedMetricLabels(lineMetrics: LineMetrics) {
  const metricsByValue = new Map<number, string[]>()
  for (const [name, metric] of Object.entries(lineMetrics)) {
    const names = metricsByValue.get(metric.value) ?? []
    names.push(LINE_METRIC_LABELS[name] ?? name)
    metricsByValue.set(metric.value, names)
  }

  return [...metricsByValue.entries()]
    .sort(([valueA], [valueB]) => valueB - valueA)
    .map(([value, names]) => ({
      value,
      text: `${names.join('/')} ${value}`,
    }))
}

function drawMetricLabel(
  canvasController: CanvasController,
  x: number,
  y: number,
  text: string,
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
  context.textAlign = 'left'
  context.textBaseline = 'middle'

  const labelY = -y
  const textWidth = context.measureText(text).width
  const width = textWidth + paddingX * 2
  const height = fontSize + paddingY * 2
  const boxX = x
  const boxY = labelY - height / 2

  context.fillStyle = parameters.labelBackgroundColor as string
  context.beginPath()
  if (context.roundRect) {
    context.roundRect(boxX, boxY, width, height, radius)
  } else {
    context.rect(boxX, boxY, width, height)
  }
  context.fill()

  context.fillStyle = parameters.labelTextColor as string
  context.fillText(text, boxX + paddingX, labelY)
  context.restore()
}

// 基線
registerVisualizationLayerDefinition({
  identifier: 'main.baseline',
  name: 'Baseline',
  selectionFunc: glyphSelector('editing'),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 100,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: '#d1a986' },
  colorsDarkMode: { strokeColor: '#FFF' },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>
  ) => {
    const context = canvasController.context
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth = parameters.strokeWidth as number

    const glyph = positionedGlyph.glyph
    strokeLine(context, 0, 0, glyph.xAdvance, 0)
  },
})

// 進階字體度量線
registerVisualizationLayerDefinition({
  identifier: 'main.lineMetrics',
  name: 'Line Metrics',
  selectionFunc: glyphSelector('editing'),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 100,
  screenParameters: {
    strokeWidth: 1,
    fontSize: 11,
    labelPaddingX: 6,
    labelPaddingY: 3,
    labelRadius: 4,
    labelGap: 8,
  },
  colors: {
    strokeColor: '#252B2E5C',
    zoneColor: '#25DAF214',
    zoneStrokeColor: '#00AFC92E',
    labelBackgroundColor: '#FFFFFFD9',
    labelTextColor: '#252B2E',
  },
  colorsDarkMode: {
    strokeColor: '#FFF6',
    zoneColor: '#00BFFF18',
    zoneStrokeColor: '#80DFFF18',
    labelBackgroundColor: '#111827CC',
    labelTextColor: '#FFFFFF',
  },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    const context = canvasController.context
    context.lineWidth = screenLength(
      canvasController,
      parameters.strokeWidth as number
    )

    const lineMetrics = getLineMetrics(model)
    const glyphWidth = positionedGlyph.glyph.xAdvance || 0
    const pathBox = new Path2D()
    if (lineMetrics.ascender && lineMetrics.descender && glyphWidth > 0) {
      pathBox.rect(
        0,
        lineMetrics.descender.value,
        glyphWidth,
        lineMetrics.ascender.value - lineMetrics.descender.value
      )
    }

    const zoneFillPaths: Path2D[] = []
    const zoneEndStrokes = new Path2D()
    for (const metric of Object.values(lineMetrics)) {
      if (metric.zone) {
        const pathZone = new Path2D()
        pathZone.rect(0, metric.value, glyphWidth, metric.zone)
        zoneFillPaths.push(pathZone)

        const zoneY = metric.value + metric.zone
        zoneEndStrokes.moveTo(0, zoneY)
        zoneEndStrokes.lineTo(glyphWidth, zoneY)
      }

      const pathMetric = new Path2D()
      pathMetric.moveTo(0, metric.value)
      pathMetric.lineTo(glyphWidth, metric.value)
      pathBox.addPath(pathMetric)
    }

    context.fillStyle = parameters.zoneColor as string
    zoneFillPaths.forEach((zonePath) => context.fill(zonePath))

    context.strokeStyle = parameters.zoneStrokeColor as string
    context.stroke(zoneEndStrokes)

    context.strokeStyle = parameters.strokeColor as string
    context.stroke(pathBox)

    const labelX =
      glyphWidth + screenLength(canvasController, parameters.labelGap as number)
    for (const metricLabel of getSortedMetricLabels(lineMetrics)) {
      drawMetricLabel(
        canvasController,
        labelX,
        metricLabel.value,
        metricLabel.text,
        parameters
      )
    }
  },
})

// 度量線 (左側邊緣、寬度)
registerVisualizationLayerDefinition({
  identifier: 'main.metrics',
  name: 'Glyph Metrics',
  selectionFunc: glyphSelector('editing'),
  userSwitchable: true,
  defaultOn: true,
  zIndex: 100,
  screenParameters: { strokeWidth: 1.2, dashArray: [12, 10] },
  colors: {
    lsbColor: '#F7EB40',
    widthColor: '#25DAF2',
  },
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>
  ) => {
    const glyph = positionedGlyph.glyph
    const context = canvasController.context
    context.lineWidth = parameters.strokeWidth as number
    context.setLineDash(parameters.dashArray as number[])

    // Draw LSB line at 0
    context.strokeStyle = parameters.lsbColor as string
    strokeLine(context, 0, -980, 0, 980)

    // Draw width line at xAdvance
    context.strokeStyle = parameters.widthColor as string
    strokeLine(context, glyph.xAdvance, -980, glyph.xAdvance, 980)

    context.setLineDash([])
  },
})
