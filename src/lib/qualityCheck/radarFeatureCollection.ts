import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import {
  sideLabels,
  strokeTypeLabels,
  type StructureSide,
} from 'src/lib/qualityCheck/structureMetrics'
import type { RadarFeatureValue } from 'src/lib/qualityCheck/qualityRadar'

const STRUCTURE_SIDES: StructureSide[] = ['left', 'right', 'top', 'bottom']
const BEARING_FLOOR_RATIO = 0.01
const SYMMETRY_FLOOR_RATIO = 0.015
const PERCENT_FLOOR = 0.01
const ASPECT_FLOOR = 0.02
const GAP_FLOOR = 0.02
const PART_GAP_FLOOR = 0.01

export const featureStatKey = (feature: RadarFeatureValue) =>
  feature.cohort ? `${feature.key}@${feature.cohort}` : feature.key

export const featureStatKeys = (feature: RadarFeatureValue) => [
  featureStatKey(feature),
  ...(feature.fallbackCohorts ?? []).map(
    (cohort) => `${feature.key}@${cohort}`
  ),
]

export const isPlacementFeature = (feature: RadarFeatureValue) =>
  feature.dimension === 'boundary' || feature.key.startsWith('balance:')

export const collectGlyphFeatures = (
  sample: GlyphGeometrySample,
  unitsPerEm: number,
  bodyCenterY: number,
  semanticEnclosure: boolean
): RadarFeatureValue[] => {
  const features: RadarFeatureValue[] = []
  const advance = Math.max(1, sample.advance)
  const ink = sample.ink
  const sideType = (side: StructureSide) =>
    semanticEnclosure ? 'framing' : sample.sides[side].type
  const hFraming =
    (sideType('left') === 'framing' ? 1 : 0) +
    (sideType('right') === 'framing' ? 1 : 0)
  const vFraming =
    (sideType('top') === 'framing' ? 1 : 0) +
    (sideType('bottom') === 'framing' ? 1 : 0)
  const hCohort = `h${hFraming}`
  const vCohort = `v${vFraming}`
  const faceCohort = `${hCohort}${vCohort}`

  const oppositeSide: Record<StructureSide, StructureSide> = {
    left: 'right',
    right: 'left',
    top: 'bottom',
    bottom: 'top',
  }
  for (const side of STRUCTURE_SIDES) {
    const type = sideType(side)
    features.push({
      key: `bearing:${side}:${type}`,
      label: `${sideLabels[side]}${strokeTypeLabels[type]}邊距`,
      dimension: 'boundary',
      format: 'units',
      value: sample.sides[side].bearing,
      cohort: sideType(oppositeSide[side]),
      scaleFloor: unitsPerEm * BEARING_FLOOR_RATIO,
    })
  }

  if (semanticEnclosure || (hFraming === 2 && vFraming === 2)) {
    features.push({
      key: 'bearing:symmetryH',
      label: '左右置中偏移',
      dimension: 'balance',
      format: 'units',
      value: sample.sides.left.bearing - sample.sides.right.bearing,
      scaleFloor: unitsPerEm * SYMMETRY_FLOOR_RATIO,
    })
  }

  const faceWidth = sample.bounds.xMax - sample.bounds.xMin
  const faceHeight = sample.bounds.yMax - sample.bounds.yMin
  features.push({
    key: 'face:widthRatio',
    label: '字面寬度比',
    dimension: 'proportion',
    format: 'percent',
    value: faceWidth / advance,
    cohort: hCohort,
    scaleFloor: PERCENT_FLOOR,
  })
  features.push({
    key: 'face:heightRatio',
    label: '字面高度比',
    dimension: 'proportion',
    format: 'percent',
    value: faceHeight / unitsPerEm,
    cohort: vCohort,
    scaleFloor: PERCENT_FLOOR,
  })
  if (faceHeight > 0) {
    features.push({
      key: 'face:aspect',
      label: '字面長寬比',
      dimension: 'proportion',
      format: 'ratio',
      value: faceWidth / faceHeight,
      cohort: faceCohort,
      scaleFloor: ASPECT_FLOOR,
    })
  }

  if (ink.gapX !== null && faceWidth > 0) {
    features.push({
      key: 'gap:x',
      label: '部件橫向間隙',
      dimension: 'proportion',
      format: 'percent',
      value: ink.gapX / faceWidth,
      cohort: hCohort,
      scaleFloor: GAP_FLOOR,
    })
  }
  if (ink.gapY !== null && faceHeight > 0) {
    features.push({
      key: 'gap:y',
      label: '部件縱向間隙',
      dimension: 'proportion',
      format: 'percent',
      value: ink.gapY / faceHeight,
      cohort: vCohort,
      scaleFloor: GAP_FLOOR,
    })
  }

  const partSpacing = sample.partSpacing
  if (partSpacing && partSpacing.gapRatio >= 0) {
    const horizontal = partSpacing.axis === 'horizontal'
    features.push({
      key: horizontal ? 'part-gap:x' : 'part-gap:y',
      label: horizontal ? '左右部件介面間距' : '上下部件介面間距',
      dimension: 'proportion',
      format: 'percent',
      value: partSpacing.gapRatio,
      cohort: `${horizontal ? 'h' : 'v'}:${partSpacing.firstCharacter}`,
      fallbackCohorts: [horizontal ? 'h' : 'v'],
      scaleFloor: PART_GAP_FLOOR,
    })
  }

  if (ink.inkToFaceRatio !== null) {
    features.push({
      key: 'ink:toFace',
      label: '字面內墨量比',
      dimension: 'ink',
      format: 'percent',
      value: ink.inkToFaceRatio,
      cohort: faceCohort,
      scaleFloor: PERCENT_FLOOR,
    })
  }
  if (ink.inkToEmRatio !== null) {
    features.push({
      key: 'ink:toEm',
      label: '版面墨量比',
      dimension: 'ink',
      format: 'percent',
      value: ink.inkToEmRatio,
      scaleFloor: PERCENT_FLOOR,
    })
  }
  if (ink.spreadX !== null && ink.spreadY !== null) {
    features.push({
      key: 'ink:spreadX',
      label: '水平密度分布',
      dimension: 'ink',
      format: 'percent',
      value: ink.spreadX / advance,
      cohort: hCohort,
      scaleFloor: PERCENT_FLOOR,
    })
    features.push({
      key: 'ink:spreadY',
      label: '垂直密度分布',
      dimension: 'ink',
      format: 'percent',
      value: ink.spreadY / unitsPerEm,
      cohort: vCohort,
      scaleFloor: PERCENT_FLOOR,
    })
  }

  if (ink.centroidX !== null && ink.centroidY !== null) {
    features.push({
      key: 'balance:centroidX',
      label: '重心水平偏移',
      dimension: 'balance',
      format: 'percent',
      value: (ink.centroidX - advance / 2) / advance,
      scaleFloor: PERCENT_FLOOR,
    })
    features.push({
      key: 'balance:centroidY',
      label: '重心垂直偏移',
      dimension: 'balance',
      format: 'percent',
      value: (ink.centroidY - bodyCenterY) / unitsPerEm,
      scaleFloor: PERCENT_FLOOR,
    })
  }
  return features
}
