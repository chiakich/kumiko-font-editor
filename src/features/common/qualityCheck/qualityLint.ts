import {
  getGlyphLayer,
  type FontData,
  type GlyphData,
  type GlyphLayerData,
  type PathData,
  type PathNode,
} from 'src/store'
import { isHanGlyph } from 'src/features/common/qualityCheck/structureMetrics'

export type QualityScope = 'changed' | 'current' | 'selected' | 'font'
export type QualityIssueSeverity = 'blocking' | 'warning' | 'info'

export interface QualityIssue {
  id: string
  severity: QualityIssueSeverity
  group: string
  glyphId: string
  glyphName: string
  message: string
}

export interface QualitySummary {
  glyphCount: number
  blockingCount: number
  warningCount: number
  infoCount: number
  deletedCount: number | null
  hasBlockingIssues: boolean
}

export interface QualityReport {
  glyphs: GlyphData[]
  issues: QualityIssue[]
  summary: QualitySummary
}

export interface BuildQualityReportInput {
  fontData: FontData | null | undefined
  scope: QualityScope
  selectedGlyphId?: string | null
  selectedGlyphIds?: string[]
  dirtyGlyphIds: string[]
  deletedGlyphIds: string[]
}

interface Bounds {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const DEFAULT_UNITS_PER_EM = 1000
const TINY_CONTOUR_UNITS = 4
const DUPLICATE_POINT_DISTANCE = 0.01

const isFiniteNumber = (value: number) => Number.isFinite(value)

const round = (value: number) => Math.round(value)

const getActiveLayer = (glyph: GlyphData): GlyphData | GlyphLayerData =>
  getGlyphLayer(glyph, glyph.activeLayerId) ?? glyph

export const getQualityScopeGlyphs = ({
  fontData,
  scope,
  selectedGlyphId = null,
  selectedGlyphIds = [],
  dirtyGlyphIds,
}: Omit<BuildQualityReportInput, 'deletedGlyphIds'>) => {
  if (!fontData) {
    return []
  }

  if (scope === 'selected') {
    return selectedGlyphIds
      .map((glyphId) => fontData.glyphs[glyphId])
      .filter((glyph): glyph is GlyphData => Boolean(glyph))
  }

  if (scope === 'current') {
    return selectedGlyphId && fontData.glyphs[selectedGlyphId]
      ? [fontData.glyphs[selectedGlyphId]]
      : []
  }

  if (scope === 'changed') {
    return dirtyGlyphIds
      .map((glyphId) => fontData.glyphs[glyphId])
      .filter((glyph): glyph is GlyphData => Boolean(glyph))
  }

  return Object.values(fontData.glyphs)
}

const makeIssue = (
  glyph: GlyphData,
  input: {
    key: string
    severity: QualityIssueSeverity
    group: string
    message: string
  }
): QualityIssue => ({
  id: `${glyph.id}:${input.key}`,
  severity: input.severity,
  group: input.group,
  glyphId: glyph.id,
  glyphName: glyph.name,
  message: input.message,
})

const getPathBounds = (path: PathData): Bounds | null => {
  if (path.nodes.length === 0) {
    return null
  }

  return {
    xMin: Math.min(...path.nodes.map((node) => node.x)),
    xMax: Math.max(...path.nodes.map((node) => node.x)),
    yMin: Math.min(...path.nodes.map((node) => node.y)),
    yMax: Math.max(...path.nodes.map((node) => node.y)),
  }
}

export const getGlyphBounds = (glyph: Pick<GlyphData, 'paths'>) => {
  const nodes = glyph.paths.flatMap((path) => path.nodes)
  if (nodes.length === 0) {
    return null
  }

  return {
    xMin: Math.min(...nodes.map((node) => node.x)),
    xMax: Math.max(...nodes.map((node) => node.x)),
    yMin: Math.min(...nodes.map((node) => node.y)),
    yMax: Math.max(...nodes.map((node) => node.y)),
  }
}

const getOnCurveNodes = (path: PathData) =>
  path.nodes.filter((node) => node.type !== 'offcurve')

const getSignedArea = (nodes: PathNode[]) => {
  if (nodes.length < 3) {
    return 0
  }

  let area = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const current = nodes[index]
    const next = nodes[(index + 1) % nodes.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

const containsBounds = (outer: Bounds, inner: Bounds) =>
  outer.xMin <= inner.xMin &&
  outer.xMax >= inner.xMax &&
  outer.yMin <= inner.yMin &&
  outer.yMax >= inner.yMax

const isDuplicatePoint = (a: PathNode, b: PathNode) =>
  Math.abs(a.x - b.x) <= DUPLICATE_POINT_DISTANCE &&
  Math.abs(a.y - b.y) <= DUPLICATE_POINT_DISTANCE

const hasComponentCycle = (
  fontData: FontData,
  glyphId: string,
  stack: string[] = []
): boolean => {
  if (stack.includes(glyphId)) {
    return true
  }

  const glyph = fontData.glyphs[glyphId]
  if (!glyph) {
    return false
  }

  const activeLayer = getActiveLayer(glyph)
  const nextStack = [...stack, glyphId]
  return activeLayer.componentRefs.some((componentRef) =>
    hasComponentCycle(fontData, componentRef.glyphId, nextStack)
  )
}

const buildGlyphIssues = (
  glyph: GlyphData,
  fontData: FontData,
  unitsPerEm: number
) => {
  const issues: QualityIssue[] = []
  const activeLayer = getActiveLayer(glyph)
  const coordinateLimit = unitsPerEm * 1.4

  const invalidNodeCount = activeLayer.paths
    .flatMap((path) => path.nodes)
    .filter((node) => !isFiniteNumber(node.x) || !isFiniteNumber(node.y)).length
  if (invalidNodeCount > 0) {
    issues.push(
      makeIssue(glyph, {
        key: 'invalid-coordinates',
        severity: 'blocking',
        group: '座標',
        message: `${invalidNodeCount} 個節點座標不是有效數字`,
      })
    )
  }

  const openPathCount = activeLayer.paths.filter((path) => !path.closed).length
  if (openPathCount > 0) {
    issues.push(
      makeIssue(glyph, {
        key: 'open-path',
        severity: 'blocking',
        group: '路徑',
        message: `${openPathCount} 條開放路徑`,
      })
    )
  }

  const emptyClosedPathCount = activeLayer.paths.filter(
    (path) => path.closed && path.nodes.length < 3
  ).length
  if (emptyClosedPathCount > 0) {
    issues.push(
      makeIssue(glyph, {
        key: 'empty-contour',
        severity: 'blocking',
        group: '路徑',
        message: `${emptyClosedPathCount} 條閉合路徑節點不足`,
      })
    )
  }

  const tinyContourCount = activeLayer.paths.filter((path) => {
    if (!path.closed) {
      return false
    }
    const bounds = getPathBounds(path)
    return (
      bounds &&
      bounds.xMax - bounds.xMin <= TINY_CONTOUR_UNITS &&
      bounds.yMax - bounds.yMin <= TINY_CONTOUR_UNITS
    )
  }).length
  if (tinyContourCount > 0) {
    issues.push(
      makeIssue(glyph, {
        key: 'tiny-contour',
        severity: 'warning',
        group: '路徑',
        message: `${tinyContourCount} 個極小輪廓，可能是碎片`,
      })
    )
  }

  const duplicatePointCount = activeLayer.paths.reduce((count, path) => {
    let pathCount = 0
    for (let index = 1; index < path.nodes.length; index += 1) {
      if (isDuplicatePoint(path.nodes[index - 1], path.nodes[index])) {
        pathCount += 1
      }
    }
    if (
      path.closed &&
      path.nodes.length > 1 &&
      isDuplicatePoint(path.nodes[0], path.nodes[path.nodes.length - 1])
    ) {
      pathCount += 1
    }
    return count + pathCount
  }, 0)
  if (duplicatePointCount > 0) {
    issues.push(
      makeIssue(glyph, {
        key: 'duplicate-points',
        severity: 'warning',
        group: '路徑',
        message: `${duplicatePointCount} 組相鄰重複點`,
      })
    )
  }

  const closedContours = activeLayer.paths
    .filter((path) => path.closed)
    .map((path, index) => {
      const onCurveNodes = getOnCurveNodes(path)
      return {
        index,
        bounds: getPathBounds(path),
        area: getSignedArea(onCurveNodes),
      }
    })
    .filter(
      (contour): contour is { index: number; bounds: Bounds; area: number } =>
        Boolean(contour.bounds) && Math.abs(contour.area) > 0
    )
  const hasNestedSameDirectionContour = closedContours.some((inner) =>
    closedContours.some(
      (outer) =>
        outer.index !== inner.index &&
        Math.abs(outer.area) > Math.abs(inner.area) &&
        Math.sign(outer.area) === Math.sign(inner.area) &&
        containsBounds(outer.bounds, inner.bounds)
    )
  )
  if (hasNestedSameDirectionContour) {
    issues.push(
      makeIssue(glyph, {
        key: 'nested-contour-direction',
        severity: 'warning',
        group: '路徑',
        message: '巢狀輪廓方向疑似相同，counter 可能反向',
      })
    )
  }

  if (
    activeLayer.metrics.width <= 0 &&
    (activeLayer.paths.length > 0 || activeLayer.componentRefs.length > 0)
  ) {
    issues.push(
      makeIssue(glyph, {
        key: 'zero-advance',
        severity: 'warning',
        group: '度量',
        message: `有輪廓但 advance width 為 ${round(activeLayer.metrics.width)}`,
      })
    )
  }

  if (
    isHanGlyph(glyph) &&
    activeLayer.metrics.width > 0 &&
    Math.round(activeLayer.metrics.width) !== Math.round(unitsPerEm)
  ) {
    issues.push(
      makeIssue(glyph, {
        key: 'advance-width',
        severity: 'warning',
        group: '度量',
        message: `漢字 advance width ${round(activeLayer.metrics.width)} 不是全形（UPM ${unitsPerEm}）`,
      })
    )
  }

  const bounds = getGlyphBounds({ paths: activeLayer.paths })
  if (bounds) {
    if (
      bounds.xMin < -coordinateLimit ||
      bounds.xMax > coordinateLimit ||
      bounds.yMin < -coordinateLimit ||
      bounds.yMax > coordinateLimit
    ) {
      issues.push(
        makeIssue(glyph, {
          key: 'coordinate-range',
          severity: 'warning',
          group: '座標',
          message: `bbox ${round(bounds.xMin)}, ${round(bounds.yMin)} / ${round(bounds.xMax)}, ${round(bounds.yMax)}`,
        })
      )
    }

    if (bounds.xMin < 0 || bounds.xMax > activeLayer.metrics.width) {
      issues.push(
        makeIssue(glyph, {
          key: 'bbox-advance-overflow',
          severity: 'warning',
          group: '度量',
          message: `bbox 超出 advance：x ${round(bounds.xMin)} 到 ${round(bounds.xMax)}，advance ${round(activeLayer.metrics.width)}`,
        })
      )
    }

    if (bounds.yMin < -unitsPerEm * 0.25 || bounds.yMax > unitsPerEm) {
      issues.push(
        makeIssue(glyph, {
          key: 'bbox-em-overflow',
          severity: 'warning',
          group: '座標',
          message: `垂直 bbox 超出 em 參考：y ${round(bounds.yMin)} 到 ${round(bounds.yMax)}`,
        })
      )
    }
  }

  const missingComponents = activeLayer.componentRefs.filter(
    (componentRef) => !fontData.glyphs[componentRef.glyphId]
  )
  if (missingComponents.length > 0) {
    issues.push(
      makeIssue(glyph, {
        key: 'missing-components',
        severity: 'blocking',
        group: 'Component',
        message: `${missingComponents.length} 個 component 找不到來源 glyph`,
      })
    )
  }

  if (hasComponentCycle(fontData, glyph.id)) {
    issues.push(
      makeIssue(glyph, {
        key: 'component-cycle',
        severity: 'blocking',
        group: 'Component',
        message: 'component reference 形成循環',
      })
    )
  }

  if (
    glyph.export !== false &&
    activeLayer.paths.length === 0 &&
    activeLayer.componentRefs.length === 0 &&
    !glyph.unicode
  ) {
    issues.push(
      makeIssue(glyph, {
        key: 'empty-export-glyph',
        severity: 'info',
        group: 'Export',
        message: '空 glyph 仍會被匯出，且沒有 unicode',
      })
    )
  }

  return issues
}

export const summarizeQualityIssues = (
  glyphCount: number,
  issues: QualityIssue[],
  deletedCount: number | null
): QualitySummary => {
  const blockingCount = issues.filter(
    (issue) => issue.severity === 'blocking'
  ).length
  const warningCount = issues.filter(
    (issue) => issue.severity === 'warning'
  ).length
  const infoCount = issues.filter((issue) => issue.severity === 'info').length

  return {
    glyphCount,
    blockingCount,
    warningCount,
    infoCount,
    deletedCount,
    hasBlockingIssues: blockingCount > 0,
  }
}

export const buildQualityReport = ({
  fontData,
  scope,
  selectedGlyphId = null,
  selectedGlyphIds = [],
  dirtyGlyphIds,
  deletedGlyphIds,
}: BuildQualityReportInput): QualityReport => {
  const glyphs = getQualityScopeGlyphs({
    fontData,
    scope,
    selectedGlyphId,
    selectedGlyphIds,
    dirtyGlyphIds,
  })
  const unitsPerEm = fontData?.unitsPerEm ?? DEFAULT_UNITS_PER_EM
  const issues = fontData
    ? glyphs.flatMap((glyph) => buildGlyphIssues(glyph, fontData, unitsPerEm))
    : []

  return {
    glyphs,
    issues,
    summary: summarizeQualityIssues(
      glyphs.length,
      issues,
      scope === 'changed' ? deletedGlyphIds.length : null
    ),
  }
}
