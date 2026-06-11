// 結構分布帶圖層：把母體統計的各邊 P10–P90 區間與眾數畫成即時輔助線

import {
  registerVisualizationLayerDefinition,
  glyphSelector,
} from 'src/canvas/SceneView'
import type {
  PositionedGlyph,
  SceneModel,
  StructureGuideModel,
  StructureGuideSide,
} from 'src/canvas/SceneView'
import type { CanvasController } from 'src/canvas/CanvasController'

type Side = keyof StructureGuideModel['sides']

interface SideGeometry {
  // band/mode/edge are positions along the side's axis in glyph coords
  toBandStart: (value: number) => number
  axis: 'x' | 'y'
}

const sideGeometry = (
  guide: StructureGuideModel
): Record<Side, SideGeometry> => ({
  left: { toBandStart: (value) => value, axis: 'x' },
  right: { toBandStart: (value) => guide.advance - value, axis: 'x' },
  top: { toBandStart: (value) => guide.bodyTop - value, axis: 'y' },
  bottom: { toBandStart: (value) => guide.bodyBottom + value, axis: 'y' },
})

const isOutsideBand = (side: StructureGuideSide) =>
  side.band !== null &&
  (side.bearing < side.band.p10 || side.bearing > side.band.p90)

registerVisualizationLayerDefinition({
  identifier: 'main.structureGuide',
  name: 'Structure Guide',
  selectionFunc: glyphSelector('editing'),
  userSwitchable: false,
  defaultOn: true,
  zIndex: 90,
  screenParameters: { modeWidth: 1.5, edgeWidth: 1.5, edgeDash: [6, 6] },
  colors: {
    framingFill: 'rgba(237, 100, 166, 0.14)',
    framingLine: 'rgba(237, 100, 166, 0.6)',
    branchingFill: 'rgba(66, 153, 225, 0.14)',
    branchingLine: 'rgba(66, 153, 225, 0.6)',
    outsideColor: '#E53E3E',
  },
  colorsDarkMode: {
    framingFill: 'rgba(237, 100, 166, 0.18)',
    framingLine: 'rgba(246, 135, 179, 0.7)',
    branchingFill: 'rgba(66, 153, 225, 0.18)',
    branchingLine: 'rgba(99, 179, 237, 0.7)',
    outsideColor: '#FC8181',
  },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    const guide = model.structureGuide
    if (!guide) {
      return
    }

    const context = canvasController.context
    const geometry = sideGeometry(guide)
    const bodyHeight = guide.bodyTop - guide.bodyBottom
    const lineScale = 1 / canvasController.magnification

    const strokeAcross = (
      axis: 'x' | 'y',
      position: number,
      color: string,
      width: number,
      dash: number[] | null
    ) => {
      context.strokeStyle = color
      context.lineWidth = width * lineScale
      context.setLineDash(dash ? dash.map((value) => value * lineScale) : [])
      context.beginPath()
      if (axis === 'x') {
        context.moveTo(position, guide.bodyBottom)
        context.lineTo(position, guide.bodyTop)
      } else {
        context.moveTo(0, position)
        context.lineTo(guide.advance, position)
      }
      context.stroke()
      context.setLineDash([])
    }

    for (const sideKey of Object.keys(guide.sides) as Side[]) {
      const side = guide.sides[sideKey]
      if (!side.band) {
        continue
      }
      const { toBandStart, axis } = geometry[sideKey]
      const from = toBandStart(side.band.p10)
      const to = toBandStart(side.band.p90)
      const fill = side.isFraming
        ? (parameters.framingFill as string)
        : (parameters.branchingFill as string)
      const line = side.isFraming
        ? (parameters.framingLine as string)
        : (parameters.branchingLine as string)

      context.fillStyle = fill
      if (axis === 'x') {
        context.fillRect(
          Math.min(from, to),
          guide.bodyBottom,
          Math.abs(to - from),
          bodyHeight
        )
      } else {
        context.fillRect(
          0,
          Math.min(from, to),
          guide.advance,
          Math.abs(to - from)
        )
      }

      strokeAcross(
        axis,
        toBandStart(side.band.mode),
        line,
        parameters.modeWidth as number,
        null
      )

      // 此邊落在 80% 區間外 → 以紅色虛線標示目前邊緣位置
      if (isOutsideBand(side)) {
        strokeAcross(
          axis,
          toBandStart(side.bearing),
          parameters.outsideColor as string,
          parameters.edgeWidth as number,
          parameters.edgeDash as number[]
        )
      }
    }
  },
})
