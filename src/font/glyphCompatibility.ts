import { getNodeSegmentType, isOffCurveNode } from 'src/store/glyphGeometry'
import type {
  GlyphAnchor,
  GlyphComponentRef,
  GlyphGuideline,
  GlyphLayerData,
  PathData,
  PathNode,
} from 'src/store/types'

export type GlyphCompatibilityIssueCode =
  | 'missing-layer'
  | 'path-count'
  | 'path-closed'
  | 'node-count'
  | 'node-kind'
  | 'node-segment-type'
  | 'component-count'
  | 'component-glyph'
  | 'anchor-count'
  | 'anchor-name'
  | 'anchor-duplicate-name'
  | 'guideline-count'

export interface GlyphCompatibilityIssue {
  code: GlyphCompatibilityIssueCode
  message: string
  layerId?: string
  pathIndex?: number
  nodeIndex?: number
  componentIndex?: number
  anchorName?: string
  guidelineIndex?: number
}

export interface GlyphCompatibilityResult {
  compatible: boolean
  issues: GlyphCompatibilityIssue[]
}

const issue = (
  code: GlyphCompatibilityIssueCode,
  message: string,
  details: Omit<GlyphCompatibilityIssue, 'code' | 'message'> = {}
): GlyphCompatibilityIssue => ({ code, message, ...details })

const layerLabel = (layer: GlyphLayerData) => layer.name || layer.id

const nodeSignature = (node: PathNode) =>
  isOffCurveNode(node)
    ? 'offcurve'
    : `oncurve:${getNodeSegmentType(node) ?? 'line'}`

const checkPaths = (
  base: PathData[],
  layer: GlyphLayerData,
  issues: GlyphCompatibilityIssue[]
) => {
  if (base.length !== layer.paths.length) {
    issues.push(
      issue(
        'path-count',
        `${layerLabel(layer)} has ${layer.paths.length} paths; expected ${base.length}`,
        { layerId: layer.id }
      )
    )
    return
  }

  for (let pathIndex = 0; pathIndex < base.length; pathIndex += 1) {
    const basePath = base[pathIndex]
    const path = layer.paths[pathIndex]
    if (basePath.closed !== path.closed) {
      issues.push(
        issue(
          'path-closed',
          `${layerLabel(layer)} path ${pathIndex + 1} has a different open/closed state`,
          { layerId: layer.id, pathIndex }
        )
      )
    }
    if (basePath.nodes.length !== path.nodes.length) {
      issues.push(
        issue(
          'node-count',
          `${layerLabel(layer)} path ${pathIndex + 1} has ${path.nodes.length} nodes; expected ${basePath.nodes.length}`,
          { layerId: layer.id, pathIndex }
        )
      )
      continue
    }

    for (let nodeIndex = 0; nodeIndex < basePath.nodes.length; nodeIndex += 1) {
      const baseNode = basePath.nodes[nodeIndex]
      const node = path.nodes[nodeIndex]
      if (baseNode.kind !== node.kind) {
        issues.push(
          issue(
            'node-kind',
            `${layerLabel(layer)} node ${nodeIndex + 1} in path ${pathIndex + 1} is ${node.kind}; expected ${baseNode.kind}`,
            { layerId: layer.id, pathIndex, nodeIndex }
          )
        )
        continue
      }
      if (nodeSignature(baseNode) !== nodeSignature(node)) {
        issues.push(
          issue(
            'node-segment-type',
            `${layerLabel(layer)} node ${nodeIndex + 1} in path ${pathIndex + 1} has a different segment type`,
            { layerId: layer.id, pathIndex, nodeIndex }
          )
        )
      }
    }
  }
}

const checkComponents = (
  base: GlyphComponentRef[],
  layer: GlyphLayerData,
  issues: GlyphCompatibilityIssue[]
) => {
  if (base.length !== layer.componentRefs.length) {
    issues.push(
      issue(
        'component-count',
        `${layerLabel(layer)} has ${layer.componentRefs.length} components; expected ${base.length}`,
        { layerId: layer.id }
      )
    )
    return
  }

  for (
    let componentIndex = 0;
    componentIndex < base.length;
    componentIndex += 1
  ) {
    const baseComponent = base[componentIndex]
    const component = layer.componentRefs[componentIndex]
    if (baseComponent.glyphId !== component.glyphId) {
      issues.push(
        issue(
          'component-glyph',
          `${layerLabel(layer)} component ${componentIndex + 1} references ${component.glyphId}; expected ${baseComponent.glyphId}`,
          { layerId: layer.id, componentIndex }
        )
      )
    }
  }
}

const duplicateAnchorNames = (anchors: GlyphAnchor[]) => {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const anchor of anchors) {
    if (seen.has(anchor.name)) {
      duplicates.add(anchor.name)
    }
    seen.add(anchor.name)
  }
  return [...duplicates]
}

const checkAnchors = (
  base: GlyphAnchor[],
  layer: GlyphLayerData,
  issues: GlyphCompatibilityIssue[]
) => {
  const baseDuplicates = duplicateAnchorNames(base)
  const layerDuplicates = duplicateAnchorNames(layer.anchors)
  for (const anchorName of [...baseDuplicates, ...layerDuplicates]) {
    issues.push(
      issue(
        'anchor-duplicate-name',
        `${layerLabel(layer)} has duplicate anchor name "${anchorName}"`,
        { layerId: layer.id, anchorName }
      )
    )
  }

  if (base.length !== layer.anchors.length) {
    issues.push(
      issue(
        'anchor-count',
        `${layerLabel(layer)} has ${layer.anchors.length} anchors; expected ${base.length}`,
        { layerId: layer.id }
      )
    )
    return
  }

  const names = new Set(layer.anchors.map((anchor) => anchor.name))
  for (const anchor of base) {
    if (!names.has(anchor.name)) {
      issues.push(
        issue(
          'anchor-name',
          `${layerLabel(layer)} is missing anchor "${anchor.name}"`,
          { layerId: layer.id, anchorName: anchor.name }
        )
      )
    }
  }
}

const checkGuidelines = (
  base: GlyphGuideline[],
  layer: GlyphLayerData,
  issues: GlyphCompatibilityIssue[]
) => {
  if (base.length !== layer.guidelines.length) {
    issues.push(
      issue(
        'guideline-count',
        `${layerLabel(layer)} has ${layer.guidelines.length} guidelines; expected ${base.length}`,
        { layerId: layer.id }
      )
    )
  }
}

export const checkGlyphInterpolationCompatibility = (
  layers: Array<GlyphLayerData | undefined>
): GlyphCompatibilityResult => {
  const presentLayers = layers.filter((layer): layer is GlyphLayerData =>
    Boolean(layer)
  )
  const issues: GlyphCompatibilityIssue[] = []
  const structuralIssues: GlyphCompatibilityIssue[] = []
  if (presentLayers.length !== layers.length) {
    issues.push(
      issue(
        'missing-layer',
        `${layers.length - presentLayers.length} source layer is missing`
      )
    )
  }
  if (presentLayers.length === 0) {
    return { compatible: false, issues }
  }
  if (presentLayers.length === 1) {
    return { compatible: true, issues }
  }

  const base = presentLayers[0]
  for (const layer of presentLayers.slice(1)) {
    checkPaths(base.paths, layer, structuralIssues)
    checkComponents(base.componentRefs, layer, structuralIssues)
    checkAnchors(base.anchors, layer, structuralIssues)
    checkGuidelines(base.guidelines, layer, structuralIssues)
  }

  return {
    compatible: structuralIssues.length === 0,
    issues: [...issues, ...structuralIssues],
  }
}
