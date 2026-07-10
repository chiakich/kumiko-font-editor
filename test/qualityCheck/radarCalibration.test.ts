import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildOpenTypeGeometrySamples } from 'src/lib/qualityCheck/openTypeSampling'
import { openTypePathToPolygons } from 'src/lib/qualityCheck/openTypeSampling'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import { computeInkFromPolygons } from 'src/lib/qualityCheck/glyphInk'
import {
  computePartSpacingMetrics,
  type SemanticPartLayout,
} from 'src/lib/qualityCheck/partSpacingMetrics'
import { computeRasterPartSpacingMetrics } from 'src/lib/qualityCheck/rasterPartSpacingMetrics'
import type { PartSpacingSamplingMethod } from 'src/lib/qualityCheck/openTypeSampling'
import { getPolygonsBounds } from 'src/lib/qualityCheck/polygonGeometry'
import { buildSidesFromPolygons } from 'src/lib/qualityCheck/structureMetrics'
import {
  computeRadarFromSamples,
  evaluateSampleAgainstRadar,
  RADAR_OUTLIER_Z,
  RADAR_SUSPECT_SCORE,
  type RadarAnalysis,
  type RadarReferenceData,
} from 'src/lib/qualityCheck/qualityRadar'
import { buildEnclosureCharacterSet } from 'src/lib/qualityCheck/semanticStructure'
import { buildSemanticPartLayoutMap } from 'src/lib/qualityCheck/semanticStructure'
import { parseCompositionLine } from 'src/lib/glyph/glyphwikiComposition'
import type { GlyphwikiPartPlacement } from 'src/lib/glyph/glyphwikiComposition'
import {
  cleanupCalibrationFontFaces,
  loadCalibrationFontFaces,
} from './calibrationFontFaces'

/**
 * 校正 harness：拿已知高品質的商業字體跑 production radar，
 * 量測誤報率（優質字體被列為 suspect 的比例應該很低）。
 * 平常 CI 不跑（字體檔不進版控）；執行方式：
 *   QUALITY_CALIBRATION=1 pnpm vitest run test/qualityCheck/radarCalibration.test.ts
 */

const repoRoot = path.join(__dirname, '..', '..')
const defaultNestedFontDir = path.join(
  repoRoot,
  'test_glyphs',
  'good_quality_font'
)
const FONT_DIR = process.env.QUALITY_CALIBRATION_FONT_DIR
  ? path.resolve(process.env.QUALITY_CALIBRATION_FONT_DIR)
  : existsSync(defaultNestedFontDir)
    ? defaultNestedFontDir
    : path.join(repoRoot, 'test_glyphs')
const COMPOSITION_PATH = path.join(
  repoRoot,
  'public',
  'glyphwiki',
  'composition.txt'
)
const REFERENCE_PATH = path.join(
  repoRoot,
  'public',
  'quality-reference',
  'noto-sans-cjk-tc-regular-radar-residuals.json'
)

const enabled = process.env.QUALITY_CALIBRATION === '1' && existsSync(FONT_DIR)
const partSpacingMethod: PartSpacingSamplingMethod =
  process.env.QUALITY_PART_SPACING_METHOD === 'raster' ? 'raster' : 'contour'

const loadCompositionMap = () => {
  const text = readFileSync(COMPOSITION_PATH, 'utf-8')
  const map = new Map<string, GlyphwikiPartPlacement[]>()
  for (const line of text.split('\n')) {
    const parsed = parseCompositionLine(line)
    if (parsed) {
      map.set(parsed.target, parsed.parts)
    }
  }
  return map
}

const loadReferenceData = (): RadarReferenceData | null => {
  if (!existsSync(REFERENCE_PATH)) {
    return null
  }
  return JSON.parse(readFileSync(REFERENCE_PATH, 'utf-8'))
}

const percent = (numerator: number, denominator: number) =>
  `${((100 * numerator) / Math.max(1, denominator)).toFixed(2)}%`

const reportRadar = (
  label: string,
  radar: RadarAnalysis,
  extraLines: string[] = []
) => {
  const lines: string[] = []
  lines.push(`=== ${label} ===`)
  lines.push(`samples: ${radar.sampleCount}`)
  lines.push(
    `suspects: ${radar.suspects.length} (${percent(radar.suspects.length, radar.sampleCount)})`
  )
  lines.push(`overallScore: ${radar.overallScore}`)
  const styleScales = Object.entries(radar.referenceStyleScales)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value.toFixed(3)}`)
    .join(', ')
  lines.push(`referenceStyleScales: ${styleScales || 'none'}`)
  const styleErrors = Object.entries(radar.referenceStyleErrors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value.toFixed(3)}`)
    .join(', ')
  lines.push(`referenceStyleErrors: ${styleErrors || 'none'}`)
  lines.push(...extraLines)
  for (const dimension of radar.dimensionScores) {
    lines.push(
      `  dim ${dimension.dimension}: score ${dimension.score}, outliers ${dimension.outlierCount} (${percent(dimension.outlierCount, radar.sampleCount)})`
    )
  }

  // reason key/basis 分布：找出誤報主要來自哪些特徵
  const reasonCounts = new Map<string, number>()
  for (const suspect of radar.suspects) {
    for (const reason of suspect.reasons) {
      if (Math.abs(reason.zScore) < RADAR_OUTLIER_Z) {
        continue
      }
      const key = `${reason.key} [${reason.basis}]`
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
    }
  }
  lines.push('reason distribution (|z| >= outlier threshold):')
  for (const [key, count] of [...reasonCounts].sort(
    (left, right) => right[1] - left[1]
  )) {
    lines.push(`  ${key}: ${count} (${percent(count, radar.sampleCount)})`)
  }

  // score 分布
  const buckets = [1, 2, 4, 8, 16, 32, Number.POSITIVE_INFINITY]
  const bucketCounts = buckets.map(() => 0)
  for (const suspect of radar.suspects) {
    const index = buckets.findIndex((limit) => suspect.score < limit)
    bucketCounts[index === -1 ? buckets.length - 1 : index] += 1
  }
  lines.push(
    `score buckets [<1,<2,<4,<8,<16,<32,>=32]: ${bucketCounts.join(', ')}`
  )

  lines.push('top suspects:')
  for (const suspect of radar.suspects.slice(0, 40)) {
    const reasonText = suspect.reasons
      .slice(0, 3)
      .map(
        (reason) =>
          `${reason.key}[${reason.basis}] z=${reason.zScore.toFixed(1)} v=${reason.value.toFixed(3)} med=${reason.median.toFixed(3)}`
      )
      .join(' | ')
    lines.push(
      `  ${suspect.character} score=${suspect.score.toFixed(2)} ${reasonText}`
    )
  }

  console.log(lines.join('\n'))
  const reportDir = process.env.QUALITY_CALIBRATION_REPORT_DIR
  if (reportDir) {
    mkdirSync(reportDir, { recursive: true })
    writeFileSync(
      path.join(reportDir, `${label.replace(/[^\w.-]+/gu, '_')}.report.txt`),
      lines.join('\n')
    )
  }
}

const comparePartSpacingSamples = (
  contourSamples: GlyphGeometrySample[],
  rasterSamples: GlyphGeometrySample[],
  partLayouts: ReadonlyMap<string, SemanticPartLayout>
) => {
  const rasterByCharacter = new Map(
    rasterSamples.map((sample) => [sample.character, sample])
  )
  let layoutCount = 0
  let contourMeasured = 0
  let contourNegative = 0
  let rasterMeasured = 0
  let rasterTouching = 0
  for (const contour of contourSamples) {
    if (!partLayouts.has(contour.character)) {
      continue
    }
    layoutCount += 1
    if (contour.partSpacing) {
      contourMeasured += 1
      if (contour.partSpacing.gapRatio < 0) {
        contourNegative += 1
      }
    }
    const raster = rasterByCharacter.get(contour.character)?.partSpacing
    if (raster) {
      rasterMeasured += 1
      if (raster.gapRatio === 0) {
        rasterTouching += 1
      }
    }
  }
  return `partSpacingComparison: layouts=${layoutCount}, contourMeasured=${contourMeasured}, contourNegative=${contourNegative}, rasterMeasured=${rasterMeasured}, rasterTouching=${rasterTouching}`
}

/** 模擬「整體右移」的做歪字：平移 bounds/邊距/重心 */
const shiftSampleRight = (
  sample: GlyphGeometrySample,
  offset: number
): GlyphGeometrySample => ({
  ...sample,
  bounds: {
    ...sample.bounds,
    xMin: sample.bounds.xMin + offset,
    xMax: sample.bounds.xMax + offset,
  },
  sides: {
    ...sample.sides,
    left: { ...sample.sides.left, bearing: sample.sides.left.bearing + offset },
    right: {
      ...sample.sides.right,
      bearing: sample.sides.right.bearing - offset,
    },
  },
  ink: {
    ...sample.ink,
    centroidX:
      sample.ink.centroidX === null ? null : sample.ink.centroidX + offset,
  },
})

/** 模擬「左右部件被拉開」的做歪字：外框不變，內部空帶變寬 */
const widenSampleGap = (sample: GlyphGeometrySample): GlyphGeometrySample => {
  const faceWidth = sample.bounds.xMax - sample.bounds.xMin
  return {
    ...sample,
    ink: {
      ...sample.ink,
      gapX: Math.max(sample.ink.gapX ?? 0, faceWidth * 0.3),
    },
  }
}

/** 模擬「字面縮小」的做歪字：對字面中心等比縮放 */
const scaleSampleFace = (
  sample: GlyphGeometrySample,
  factor: number,
  bodyBox: { top: number; bottom: number }
): GlyphGeometrySample => {
  const centerX = (sample.bounds.xMin + sample.bounds.xMax) / 2
  const centerY = (sample.bounds.yMin + sample.bounds.yMax) / 2
  const scale = (value: number, center: number) =>
    center + (value - center) * factor
  const bounds = {
    xMin: scale(sample.bounds.xMin, centerX),
    xMax: scale(sample.bounds.xMax, centerX),
    yMin: scale(sample.bounds.yMin, centerY),
    yMax: scale(sample.bounds.yMax, centerY),
  }
  return {
    ...sample,
    bounds,
    sides: {
      left: { ...sample.sides.left, bearing: Math.round(bounds.xMin) },
      right: {
        ...sample.sides.right,
        bearing: Math.round(sample.advance - bounds.xMax),
      },
      top: {
        ...sample.sides.top,
        bearing: Math.round(bodyBox.top - bounds.yMax),
      },
      bottom: {
        ...sample.sides.bottom,
        bearing: Math.round(bounds.yMin - bodyBox.bottom),
      },
    },
    ink: {
      ...sample.ink,
      inkArea: sample.ink.inkArea * factor * factor,
      spreadX: sample.ink.spreadX === null ? null : sample.ink.spreadX * factor,
      spreadY: sample.ink.spreadY === null ? null : sample.ink.spreadY * factor,
    },
  }
}

const movePartsOutward = (
  sample: GlyphGeometrySample,
  polygons: ReturnType<typeof openTypePathToPolygons>,
  layout: SemanticPartLayout,
  offset: number,
  bodyBox: { top: number; bottom: number; unitsPerEm: number },
  spacingMethod: PartSpacingSamplingMethod
): GlyphGeometrySample | null => {
  const width = sample.bounds.xMax - sample.bounds.xMin
  const height = sample.bounds.yMax - sample.bounds.yMin
  const split =
    layout.axis === 'horizontal'
      ? sample.bounds.xMin + width * layout.splitRatio
      : sample.bounds.yMax - height * layout.splitRatio
  const moved = polygons.map((polygon) => {
    const polygonBounds = getPolygonsBounds([polygon])!
    const center =
      layout.axis === 'horizontal'
        ? (polygonBounds.xMin + polygonBounds.xMax) / 2
        : (polygonBounds.yMin + polygonBounds.yMax) / 2
    const first = layout.axis === 'horizontal' ? center < split : center > split
    return polygon.map((point) => ({
      x:
        layout.axis === 'horizontal'
          ? point.x + (first ? -offset : offset)
          : point.x,
      y:
        layout.axis === 'vertical'
          ? point.y + (first ? offset : -offset)
          : point.y,
    }))
  })
  const bounds = getPolygonsBounds(moved)
  if (!bounds) {
    return null
  }
  return {
    ...sample,
    bounds,
    sides: buildSidesFromPolygons(moved, bounds, sample.advance, bodyBox),
    ink: computeInkFromPolygons(moved, sample.advance, bodyBox.unitsPerEm),
    partSpacing:
      spacingMethod === 'raster'
        ? computeRasterPartSpacingMetrics(moved, bounds, layout)
        : computePartSpacingMetrics(moved, bounds, layout),
  }
}

describe.runIf(enabled)('radar calibration on good-quality fonts', () => {
  const compositionMap = enabled ? loadCompositionMap() : new Map()
  const enclosureSet = buildEnclosureCharacterSet(compositionMap)
  const partLayouts = buildSemanticPartLayoutMap(compositionMap)
  const referenceData = enabled ? loadReferenceData() : null
  const fontFaces = enabled ? loadCalibrationFontFaces(FONT_DIR, repoRoot) : []

  afterAll(cleanupCalibrationFontFaces)

  it.each(fontFaces)(
    'reports low suspect rate for $label',
    ({ label: fontFile, font }) => {
      const { bodyBox, samples } = buildOpenTypeGeometrySamples(
        font,
        partLayouts,
        { partSpacingMethod }
      )
      const radar = computeRadarFromSamples(
        samples,
        bodyBox,
        enclosureSet,
        referenceData
      )
      expect(radar).not.toBeNull()
      if (!radar) {
        return
      }
      const comparisonLines: string[] = []
      if (process.env.QUALITY_COMPARE_PART_SPACING === '1') {
        const contourSamples =
          partSpacingMethod === 'contour'
            ? samples
            : buildOpenTypeGeometrySamples(font, partLayouts, {
                partSpacingMethod: 'contour',
              }).samples
        const rasterSamples =
          partSpacingMethod === 'raster'
            ? samples
            : buildOpenTypeGeometrySamples(font, partLayouts, {
                partSpacingMethod: 'raster',
              }).samples
        comparisonLines.push(
          comparePartSpacingSamples(contourSamples, rasterSamples, partLayouts)
        )
      }
      reportRadar(fontFile, radar, comparisonLines)

      // 召回率：把正常字做歪（右移 6% UPM / 字面縮小 15%），
      // 用凍結的 radar 評估（同編輯頁流程），應該幾乎全數被抓到
      const upm = bodyBox.unitsPerEm
      const candidates = samples
        .filter(
          (sample) =>
            (sample.bounds.xMax - sample.bounds.xMin) / sample.advance > 0.7
        )
        .filter((_, index) => index % 137 === 0)
        .slice(0, 80)
      let shiftCaught = 0
      let shrinkCaught = 0
      let gapCaught = 0
      for (const sample of candidates) {
        const shifted = evaluateSampleAgainstRadar(
          shiftSampleRight(sample, Math.round(upm * 0.06)),
          radar,
          bodyBox
        )
        if (shifted.score >= RADAR_SUSPECT_SCORE) {
          shiftCaught += 1
        }
        const shrunk = evaluateSampleAgainstRadar(
          scaleSampleFace(sample, 0.85, bodyBox),
          radar,
          bodyBox
        )
        if (shrunk.score >= RADAR_SUSPECT_SCORE) {
          shrinkCaught += 1
        }
        const widened = evaluateSampleAgainstRadar(
          widenSampleGap(sample),
          radar,
          bodyBox
        )
        if (widened.score >= RADAR_SUSPECT_SCORE) {
          gapCaught += 1
        }
      }
      console.log(
        `${fontFile} recall: shift ${shiftCaught}/${candidates.length}, shrink ${shrinkCaught}/${candidates.length}, gap ${gapCaught}/${candidates.length}`
      )
      expect(shiftCaught / candidates.length).toBeGreaterThan(0.8)
      expect(shrinkCaught / candidates.length).toBeGreaterThan(0.8)
      expect(gapCaught / candidates.length).toBeGreaterThan(0.8)

      // 真實輪廓擾動：依語意分界把兩側 contour 各向外移 1% UPM，
      // 再完整重算幾何；不能只竄改 sample.gapX。
      let movementTotal = 0
      let movementCaught = 0
      let movementSpecific = 0
      for (const sample of samples) {
        if (movementTotal >= 200 || !sample.partSpacing) {
          continue
        }
        const layout = partLayouts.get(sample.character)
        const glyph = font.charToGlyph(sample.character)
        if (
          !layout ||
          sample.partSpacing.gapRatio < 0 ||
          !glyph.path?.commands?.length
        ) {
          continue
        }
        const moved = movePartsOutward(
          sample,
          openTypePathToPolygons(glyph.path.commands),
          layout,
          bodyBox.unitsPerEm * 0.01,
          bodyBox,
          partSpacingMethod
        )
        if (!moved?.partSpacing || moved.partSpacing.gapRatio < 0) {
          continue
        }
        movementTotal += 1
        const evaluation = evaluateSampleAgainstRadar(
          moved,
          radar,
          bodyBox,
          sample.partSpacing
        )
        if (evaluation.score >= RADAR_SUSPECT_SCORE) {
          movementCaught += 1
        }
        if (
          evaluation.reasons.some(
            (reason) =>
              reason.key ===
                (layout.axis === 'horizontal' ? 'part-gap:x' : 'part-gap:y') &&
              reason.basis === 'baseline'
          )
        ) {
          movementSpecific += 1
        }
      }
      console.log(
        `${fontFile} real part movement ±1% UPM: caught ${movementCaught}/${movementTotal}, specific ${movementSpecific}/${movementTotal}`
      )
      expect(movementTotal).toBeGreaterThan(50)
      expect(movementCaught / movementTotal).toBeGreaterThan(0.8)
      expect(movementSpecific / movementTotal).toBeGreaterThan(0.8)
    },
    600_000
  )
})
