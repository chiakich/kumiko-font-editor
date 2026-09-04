// 導出 Canvas 相關模組

export { CanvasController, withSavedState } from '@/sceneView/CanvasController'
export type { Rect, Viewport } from '@/sceneView/CanvasController'
export {
  SceneView,
  VisualizationLayer,
  registerVisualizationLayerDefinition,
  glyphSelector,
  visualizationLayerDefinitions,
} from '@/sceneView/SceneView'
export type {
  ComponentData,
  SceneModel,
  PositionedGlyph,
  GlyphData,
  GuidelineData,
  Point,
  StructureGuideModel,
  VisualizationLayerDefinition,
} from '@/sceneView/SceneView'

// Import layers to register them
import '@/sceneView/layers'
