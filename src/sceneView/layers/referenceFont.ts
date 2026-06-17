// Reference font layer: a single character from a user-loaded font, drawn
// faintly behind the editing glyph for tracing. The path is supplied by
// CanvasWorkspace via SceneModel.referencePath. See lib/referenceFont.

import {
  registerVisualizationLayerDefinition,
  glyphSelector,
} from 'src/sceneView/SceneView'
import type { PositionedGlyph, SceneModel } from 'src/sceneView/SceneView'
import type { CanvasController } from 'src/sceneView/CanvasController'

registerVisualizationLayerDefinition({
  identifier: 'main.reference.font',
  name: 'Reference Font',
  selectionFunc: glyphSelector('editing'),
  // Below the glyph fill/stroke (450/500), above grid (0/1) and metrics (100).
  zIndex: 110,
  colors: { fillColor: '#1f6feb33' },
  colorsDarkMode: { fillColor: '#58a6ff40' },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (!model.referencePath) return
    const context = canvasController.context
    context.fillStyle = parameters.fillColor as string
    context.fill(model.referencePath)
  },
})

// Faint outlines of non-active glyph layers, drawn behind the editing layer.
registerVisualizationLayerDefinition({
  identifier: 'main.layer.backdrop',
  name: 'Layer Backdrop',
  selectionFunc: glyphSelector('editing'),
  zIndex: 120,
  colors: { fillColor: '#7cc7ff26', strokeColor: '#0b4f8a' },
  colorsDarkMode: { fillColor: '#58a6ff2e', strokeColor: '#79c0ff' },
  screenParameters: { strokeWidth: 1 },
  draw: (
    canvasController: CanvasController,
    _positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel
  ) => {
    if (!model.backdropPaths?.length) return
    const context = canvasController.context
    context.fillStyle = parameters.fillColor as string
    context.strokeStyle = parameters.strokeColor as string
    context.lineWidth =
      (parameters.strokeWidth as number) / canvasController.magnification
    for (const path of model.backdropPaths) {
      context.fill(path)
      context.stroke(path)
    }
  },
})
