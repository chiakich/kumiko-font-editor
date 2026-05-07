// 導出 Canvas 相關模組

export { CanvasController, withSavedState } from 'src/canvas/CanvasController'
export type { Rect, Viewport } from 'src/canvas/CanvasController'
export {
  SceneView,
  VisualizationLayer,
  registerVisualizationLayerDefinition,
  glyphSelector,
  visualizationLayerDefinitions,
} from 'src/canvas/SceneView'
export type {
  ComponentData,
  SceneModel,
  PositionedGlyph,
  GlyphData,
  GuidelineData,
  Point,
  VisualizationLayerDefinition,
} from 'src/canvas/SceneView'

// Import layers to register them
import 'src/canvas/layers'
