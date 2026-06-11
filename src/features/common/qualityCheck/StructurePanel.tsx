import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  SimpleGrid,
  Spinner,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import type { FontData, GlyphData } from 'src/store'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/qualityCheckMode'
import {
  sideLabels,
  strokeTypeLabels,
  type SideDistribution,
  type StructureBaseline,
  type StructureSide,
} from 'src/features/common/qualityCheck/structureMetrics'
import { isHanGlyph } from 'src/features/common/qualityCheck/hanClassification'
import { resolveFontGlyphs } from 'src/features/common/qualityCheck/resolvedGlyph'
import {
  buildGlyphGeometrySample,
  type GlyphGeometrySample,
} from 'src/features/common/qualityCheck/glyphSampling'
import { useQualityAnalysis } from 'src/features/common/qualityCheck/useQualityAnalysis'
import {
  formatRadarReason,
  radarDimensionLabels,
  type RadarGlyphEvaluation,
} from 'src/features/common/qualityCheck/qualityRadar'

interface StructurePanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  mode: QualityCheckMode
  onLocateGlyph: (glyphId: string) => void
}

const STRUCTURE_SIDES: StructureSide[] = ['left', 'right', 'top', 'bottom']

const FRAMING_FILL = 'var(--chakra-colors-pink-200)'
const FRAMING_LINE = 'var(--chakra-colors-pink-500)'
const BRANCHING_FILL = 'var(--chakra-colors-blue-200)'
const BRANCHING_LINE = 'var(--chakra-colors-blue-500)'

function StructureRangeSvg({ baseline }: { baseline: StructureBaseline }) {
  const { unitsPerEm } = baseline.bodyBox
  const scale = 1000 / unitsPerEm

  const bandRects = (
    side: StructureSide,
    distribution: SideDistribution | null,
    fill: string,
    line: string
  ) => {
    if (!distribution) {
      return null
    }
    const from = distribution.p10 * scale
    const to = distribution.p90 * scale
    const mode = distribution.mode * scale
    const clamp = (value: number) => Math.max(0, Math.min(1000, value))
    const bandStart = clamp(Math.min(from, to))
    const bandSize = Math.max(2, Math.abs(to - from))

    if (side === 'left') {
      return (
        <>
          <rect
            x={bandStart}
            y={0}
            width={bandSize}
            height={1000}
            fill={fill}
            opacity={0.55}
          />
          <line
            x1={mode}
            y1={0}
            x2={mode}
            y2={1000}
            stroke={line}
            strokeWidth={4}
          />
        </>
      )
    }
    if (side === 'right') {
      return (
        <>
          <rect
            x={clamp(1000 - to)}
            y={0}
            width={bandSize}
            height={1000}
            fill={fill}
            opacity={0.55}
          />
          <line
            x1={1000 - mode}
            y1={0}
            x2={1000 - mode}
            y2={1000}
            stroke={line}
            strokeWidth={4}
          />
        </>
      )
    }
    if (side === 'top') {
      return (
        <>
          <rect
            x={0}
            y={bandStart}
            width={1000}
            height={bandSize}
            fill={fill}
            opacity={0.55}
          />
          <line
            x1={0}
            y1={mode}
            x2={1000}
            y2={mode}
            stroke={line}
            strokeWidth={4}
          />
        </>
      )
    }
    return (
      <>
        <rect
          x={0}
          y={clamp(1000 - to)}
          width={1000}
          height={bandSize}
          fill={fill}
          opacity={0.55}
        />
        <line
          x1={0}
          y1={1000 - mode}
          x2={1000}
          y2={1000 - mode}
          stroke={line}
          strokeWidth={4}
        />
      </>
    )
  }

  return (
    <Box
      as="svg"
      viewBox="-20 -20 1040 1040"
      w="100%"
      maxW="340px"
      color="field.ink"
      role="img"
      aria-label="structure ranges"
    >
      <rect
        x={0}
        y={0}
        width={1000}
        height={1000}
        fill="none"
        stroke="currentColor"
        strokeWidth={6}
      />
      {STRUCTURE_SIDES.map((side) => (
        <g key={`branching-${side}`}>
          {bandRects(
            side,
            baseline.sides[side].branching,
            BRANCHING_FILL,
            BRANCHING_LINE
          )}
        </g>
      ))}
      {STRUCTURE_SIDES.map((side) => (
        <g key={`framing-${side}`}>
          {bandRects(
            side,
            baseline.sides[side].framing,
            FRAMING_FILL,
            FRAMING_LINE
          )}
        </g>
      ))}
    </Box>
  )
}

function DistributionRow({
  label,
  colorScheme,
  distribution,
}: {
  label: string
  colorScheme: string
  distribution: SideDistribution | null
}) {
  return (
    <HStack justify="space-between" spacing={3}>
      <Badge colorScheme={colorScheme}>{label}</Badge>
      {distribution ? (
        <Text fontFamily="mono" fontSize="xs">
          眾數 {distribution.mode}・80% {distribution.p10}–{distribution.p90}・
          {distribution.count} 字
        </Text>
      ) : (
        <Text fontFamily="mono" fontSize="xs" color="field.muted">
          無樣本
        </Text>
      )}
    </HStack>
  )
}

function SuspectRow({
  evaluation,
  rank,
  onLocateGlyph,
}: {
  evaluation: RadarGlyphEvaluation
  rank: number | null
  onLocateGlyph: (glyphId: string) => void
}) {
  return (
    <HStack
      justify="space-between"
      align="flex-start"
      px={3}
      py={2}
      spacing={3}
    >
      <HStack spacing={3} minW={0} align="flex-start">
        {rank !== null ? (
          <Text
            fontFamily="mono"
            fontSize="xs"
            color="field.muted"
            fontWeight="900"
            w="28px"
            pt={1}
          >
            #{rank}
          </Text>
        ) : null}
        <Text fontFamily="glyph" fontSize="2xl" lineHeight={1.2}>
          {evaluation.character}
        </Text>
        <Stack spacing={1} minW={0}>
          <HStack spacing={2}>
            <Text fontFamily="mono" fontSize="xs" fontWeight="900">
              {evaluation.glyphName}
            </Text>
            <Tag
              size="sm"
              colorScheme={evaluation.score > 4 ? 'red' : 'orange'}
            >
              風險 {evaluation.score.toFixed(1)}
            </Tag>
          </HStack>
          <HStack spacing={1} flexWrap="wrap">
            {evaluation.reasons.slice(0, 3).map((reason) => (
              <Tag key={reason.key} size="sm" variant="subtle">
                {formatRadarReason(reason)}
              </Tag>
            ))}
            {evaluation.reasons.length > 3 ? (
              <Tag size="sm" variant="subtle" color="field.muted">
                +{evaluation.reasons.length - 3}
              </Tag>
            ) : null}
          </HStack>
        </Stack>
      </HStack>
      <Button
        size="xs"
        variant="outline"
        flexShrink={0}
        onClick={() => onLocateGlyph(evaluation.glyphId)}
      >
        定位
      </Button>
    </HStack>
  )
}

function GlyphSideTable({ sample }: { sample: GlyphGeometrySample }) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
      {STRUCTURE_SIDES.map((side) => {
        const sideSample = sample.sides[side]
        return (
          <HStack key={side} justify="space-between" spacing={3}>
            <HStack spacing={2}>
              <Text fontSize="xs" fontWeight="800" w="34px">
                {sideLabels[side]}
              </Text>
              <Badge
                colorScheme={sideSample.type === 'framing' ? 'pink' : 'blue'}
              >
                {strokeTypeLabels[sideSample.type]}
              </Badge>
            </HStack>
            <Text fontFamily="mono" fontSize="xs">
              邊距 {sideSample.bearing}
            </Text>
          </HStack>
        )
      })}
    </SimpleGrid>
  )
}

export function StructurePanel({
  fontData,
  scopedGlyphs,
  mode,
  onLocateGlyph,
}: StructurePanelProps) {
  // 母體分析在 Worker 背景跑（解析在主執行緒做一次，重計算丟背景）。
  const { analysis, isAnalyzing } = useQualityAnalysis(fontData, true)
  const baseline = analysis?.baseline ?? null
  const radar = analysis?.radar ?? null

  const scopedSamples = useMemo(() => {
    if (!fontData || !baseline || mode !== 'selected') {
      return []
    }
    const resolvedFont = resolveFontGlyphs(fontData)
    return scopedGlyphs
      .filter((glyph) => isHanGlyph(glyph))
      .map((glyph) =>
        buildGlyphGeometrySample(
          resolvedFont.glyphs[glyph.id],
          resolvedFont.glyphs,
          baseline.bodyBox
        )
      )
      .filter((sample): sample is GlyphGeometrySample => sample !== null)
  }, [baseline, fontData, mode, scopedGlyphs])

  const visibleEvaluations = useMemo(() => {
    if (!radar) {
      return []
    }
    if (mode === 'selected') {
      return scopedGlyphs
        .map((glyph) => radar.evaluationByGlyphId.get(glyph.id))
        .filter(
          (evaluation): evaluation is RadarGlyphEvaluation =>
            evaluation !== undefined
        )
        .sort((left, right) => right.score - left.score)
    }
    return radar.suspects.slice(0, 50)
  }, [mode, radar, scopedGlyphs])

  if (!baseline) {
    return (
      <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={6}>
        {isAnalyzing ? (
          <HStack spacing={3}>
            <Spinner size="sm" color="field.yellow.400" />
            <Text fontSize="sm" color="field.muted" fontWeight="800">
              正在背景分析字體幾何…
            </Text>
          </HStack>
        ) : (
          <Text fontSize="sm" color="field.muted" fontWeight="800">
            字體中還沒有可分析的漢字輪廓，無法推導結構基準值。
          </Text>
        )}
      </Box>
    )
  }

  return (
    <Stack spacing={4}>
      {radar ? (
        <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
          <RadarScoreTile
            label="整體健康度"
            score={radar.overallScore}
            detail={`${radar.sampleCount} 個漢字樣本`}
            emphasized
          />
          {radar.dimensionScores.map((entry) => (
            <RadarScoreTile
              key={entry.dimension}
              label={radarDimensionLabels[entry.dimension]}
              score={entry.score}
              detail={`${entry.outlierCount} 個離群字`}
            />
          ))}
        </SimpleGrid>
      ) : (
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={4}>
          <Text fontSize="sm" color="field.muted">
            漢字樣本不足（需 20 個以上），尚無法建立統計基準。
          </Text>
        </Box>
      )}

      <Text fontSize="sm" color="field.muted">
        依
        3type《中文字体解密组报告》：每個漢字的真實字面框由最外側的「邊界筆畫」定義，
        以線定義的是<b>框架筆畫</b>（粉紅），以點定義的是<b>樹枝筆畫</b>（藍）。
        以下基準值由字體現有 {baseline.sampleCount} 個漢字推導：
        各邊兩類筆畫邊距的眾數與 80% 集中區間，可用來檢查新做或新產生的字。
      </Text>

      <HStack align="flex-start" spacing={6} flexWrap="wrap">
        <StructureRangeSvg baseline={baseline} />
        <Stack spacing={3} flex={1} minW="260px">
          {STRUCTURE_SIDES.map((side) => (
            <Box
              key={side}
              borderWidth={1}
              borderColor="field.line"
              bg="field.panel"
              p={3}
            >
              <Text fontSize="xs" fontWeight="900" mb={2}>
                {sideLabels[side]}
              </Text>
              <Stack spacing={1}>
                <DistributionRow
                  label="框架"
                  colorScheme="pink"
                  distribution={baseline.sides[side].framing}
                />
                <DistributionRow
                  label="樹枝"
                  colorScheme="blue"
                  distribution={baseline.sides[side].branching}
                />
              </Stack>
            </Box>
          ))}
          {baseline.centerOffsetMedian !== null ? (
            <Tag size="sm" w="fit-content">
              左右框架字 lsb−rsb 基準 {baseline.centerOffsetMedian}
            </Tag>
          ) : null}
        </Stack>
      </HStack>

      {mode === 'selected' ? (
        <Stack spacing={3}>
          <Text fontSize="sm" fontWeight="900">
            選取字的邊界筆畫分析（{scopedSamples.length} 個漢字）
          </Text>
          {scopedSamples.length === 0 ? (
            <Box
              borderWidth={1}
              borderColor="field.line"
              bg="field.panel"
              p={4}
            >
              <Text fontSize="sm" color="field.muted">
                選取的字中沒有可分析的漢字輪廓。
              </Text>
            </Box>
          ) : (
            scopedSamples.map((sample) => (
              <Box
                key={sample.glyphId}
                borderWidth={1}
                borderColor="field.line"
                bg="field.panel"
                p={3}
              >
                <HStack justify="space-between" mb={2}>
                  <HStack spacing={3}>
                    <Text fontFamily="glyph" fontSize="2xl" lineHeight={1}>
                      {sample.character}
                    </Text>
                    <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                      {sample.glyphName}
                    </Text>
                  </HStack>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => onLocateGlyph(sample.glyphId)}
                  >
                    定位
                  </Button>
                </HStack>
                <GlyphSideTable sample={sample} />
              </Box>
            ))
          )}
        </Stack>
      ) : null}

      {radar ? (
        <Box borderWidth={1} borderColor="field.line" bg="field.panel">
          <HStack justify="space-between" px={3} py={2} bg="field.panelMuted">
            <Text fontSize="sm" fontWeight="900">
              {mode === 'selected'
                ? '選取字的離群分析'
                : '最值得人工檢查的字（風險排名）'}
            </Text>
            <HStack spacing={2}>
              <Tag
                size="sm"
                colorScheme={radar.suspects.length > 0 ? 'orange' : 'green'}
              >
                {mode === 'selected'
                  ? `${visibleEvaluations.filter((entry) => entry.score > 0).length} 個離群`
                  : `${radar.suspects.length} 個可疑字`}
              </Tag>
            </HStack>
          </HStack>
          {visibleEvaluations.length === 0 ? (
            <Box p={4}>
              <Text fontSize="sm" color="field.muted">
                {mode === 'selected'
                  ? '選取的字中沒有可分析的漢字。'
                  : '沒有偏離群體統計基準的字。'}
              </Text>
            </Box>
          ) : (
            <Stack spacing={0} divider={<Divider />} align="stretch">
              {visibleEvaluations.map((evaluation, index) => (
                <SuspectRow
                  key={evaluation.glyphId}
                  evaluation={evaluation}
                  rank={mode === 'selected' ? null : index + 1}
                  onLocateGlyph={onLocateGlyph}
                />
              ))}
              {mode !== 'selected' &&
              radar.suspects.length > visibleEvaluations.length ? (
                <Text fontSize="xs" color="field.muted" px={3} py={2}>
                  其餘 {radar.suspects.length - visibleEvaluations.length}{' '}
                  個可疑字已省略。
                </Text>
              ) : null}
            </Stack>
          )}
        </Box>
      ) : null}
    </Stack>
  )
}

function RadarScoreTile({
  label,
  score,
  detail,
  emphasized,
}: {
  label: string
  score: number
  detail: string
  emphasized?: boolean
}) {
  const tone = score >= 95 ? 'green' : score >= 85 ? 'yellow' : 'orange'
  return (
    <Box
      borderWidth={emphasized ? 2 : 1}
      borderColor={emphasized ? 'field.ink' : 'field.line'}
      bg={`${tone}.50`}
      p={3}
    >
      <Text fontSize="xs" color="field.muted" fontWeight="800">
        {label}
      </Text>
      <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
        {score}
      </Text>
      <Text fontSize="xs" color="field.muted">
        {detail}
      </Text>
    </Box>
  )
}
