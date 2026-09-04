// SceneView 與 Visualization Layers 架構

import {
  withSavedState,
  type CanvasController,
} from '@/sceneView/CanvasController'
import type { SceneModel, PositionedGlyph } from '@/sceneView/types'
export type {
  SceneModel,
  StructureGuideSide,
  StructureGuideModel,
  PathHitInfo,
  PositionedGlyph,
  GlyphData,
  Point,
  ComponentData,
  GuidelineData,
} from '@/sceneView/types'

export interface VisualizationLayerDefinition {
  identifier: string
  name: string
  selectionFunc: (
    visContext: VisContext,
    layer: VisualizationLayerDefinition
  ) => PositionedGlyph[]
  userSwitchable?: boolean
  defaultOn?: boolean
  zIndex: number
  screenParameters?: Record<string, number | number[]>
  colors: Record<string, string>
  colorsDarkMode?: Record<string, string>
  draw: (
    canvasController: CanvasController,
    positionedGlyph: PositionedGlyph,
    parameters: Record<string, number | number[] | string>,
    model: SceneModel,
    controller: CanvasController
  ) => void
}

export interface VisContext {
  glyphsBySelectionMode: Record<string, PositionedGlyph[]>
}

export class SceneView {
  layers: VisualizationLayer[] = []
  model: SceneModel = {}

  constructor(layers: VisualizationLayer[] = []) {
    this.layers = layers.filter((l) => l.visible)
  }

  draw(canvasController: CanvasController, model: SceneModel) {
    // Sort layers by zIndex
    const sortedLayers = [...this.layers].sort(
      (a, b) => a.definition.zIndex - b.definition.zIndex
    )

    for (const _layer of sortedLayers) {
      _layer.draw(canvasController, model)
    }
  }

  addLayer(layer: VisualizationLayer) {
    this.layers.push(layer)
    this.layers.sort((a, b) => a.definition.zIndex - b.definition.zIndex)
  }

  removeLayer(identifier: string) {
    this.layers = this.layers.filter(
      (l) => l.definition.identifier !== identifier
    )
  }

  setLayerVisible(identifier: string, visible: boolean) {
    const layer = this.layers.find(
      (l) => l.definition.identifier === identifier
    )
    if (layer) {
      layer.visible = visible
    }
  }
}

export class VisualizationLayer {
  definition: VisualizationLayerDefinition
  visible: boolean
  private _colors: Record<string, string>

  constructor(definition: VisualizationLayerDefinition) {
    this.definition = definition
    this.visible = definition.defaultOn !== false
    this._colors = definition.colors
  }

  draw(canvasController: CanvasController, model: SceneModel) {
    if (!this.visible || (!model.glyph && !model.glyphs?.length)) {
      return
    }

    // Build parameters
    const parameters: Record<string, number | number[] | string> = {
      ...this.definition.screenParameters,
      ...this._colors,
    }

    // Get glyphs to render
    const allGlyphs = model.glyphs?.length
      ? model.glyphs
      : model.glyph
        ? [model.glyph]
        : []
    const visContext: VisContext = {
      glyphsBySelectionMode: {
        editing: allGlyphs.filter((glyph) => glyph.isEditing),
        selected: allGlyphs.filter((glyph) => glyph.isSelected),
        hovered: allGlyphs.filter((glyph) => glyph.isHovered),
        all: allGlyphs,
        unselected: allGlyphs.filter((glyph) => !glyph.isEditing),
        notediting: allGlyphs.filter((glyph) => !glyph.isEditing),
      },
    }

    const glyphs = this.definition.selectionFunc(visContext, this.definition)

    // Draw each glyph
    for (const glyph of glyphs) {
      if (glyph) {
        withSavedState(canvasController.context, () => {
          canvasController.context.translate(glyph.x, glyph.y)
          this.definition.draw(
            canvasController,
            glyph,
            parameters,
            model,
            canvasController
          )
        })
      }
    }
  }
}

// Layer registry
export const visualizationLayerDefinitions: VisualizationLayerDefinition[] = []

export function registerVisualizationLayerDefinition(
  layerDef: VisualizationLayerDefinition
) {
  // Find insertion point based on zIndex
  let index = 0
  for (index = 0; index < visualizationLayerDefinitions.length; index++) {
    if (layerDef.zIndex < visualizationLayerDefinitions[index].zIndex) {
      break
    }
  }
  visualizationLayerDefinitions.splice(index, 0, layerDef)
}

export function glyphSelector(selectionMode: string) {
  return (visContext: VisContext) => {
    const glyphs = visContext.glyphsBySelectionMode[selectionMode] || []
    return glyphs
  }
}
