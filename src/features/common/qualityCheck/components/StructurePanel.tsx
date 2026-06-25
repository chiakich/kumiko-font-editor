import {
  Box,
  Button,
  HStack,
  Separator,
  SimpleGrid,
  Spinner,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import { useStore, type FontData, type GlyphData } from 'src/store'
import type { QualityScope } from 'src/lib/qualityCheck/qualityLint'
import { sideLabels } from 'src/lib/qualityCheck/structureMetrics'
import { isHanGlyph } from 'src/lib/qualityCheck/hanClassification'
import { resolveFontGlyphs } from 'src/lib/qualityCheck/resolvedGlyph'
import {
  buildGlyphGeometrySample,
  type GlyphGeometrySample,
} from 'src/lib/qualityCheck/glyphSampling'
import { useQualityAnalysis } from 'src/features/common/qualityCheck/hooks/useQualityAnalysis'
import {
  radarDimensionLabels,
  type RadarGlyphEvaluation,
} from 'src/lib/qualityCheck/qualityRadar'
import {
  DistributionRow,
  GlyphSideTable,
  RadarScoreTile,
  StructureRangeSvg,
  SuspectRow,
} from 'src/features/common/qualityCheck/components/structurePanel/StructurePanelParts'
import { STRUCTURE_SIDES } from 'src/features/common/qualityCheck/components/structurePanel/structurePanelConstants'

interface StructurePanelProps {
  fontData: FontData | null
  scopedGlyphs: GlyphData[]
  scope: QualityScope
  onLocateGlyph: (glyphId: string) => void
}

export function StructurePanel({
  fontData,
  scopedGlyphs,
  scope,
  onLocateGlyph,
}: StructurePanelProps) {
  const referenceData = useStore((state) =>
    state.referenceFontResidualEnabled &&
    state.referenceFontResidualStatus === 'ready'
      ? (state.referenceFontResidualData ?? undefined)
      : undefined
  )
  // 母體分析在 Worker 背景跑（解析在主執行緒做一次，重計算丟背景）。
  const { analysis, isAnalyzing } = useQualityAnalysis(
    fontData,
    true,
    referenceData
  )
  const baseline = analysis?.baseline ?? null
  const radar = analysis?.radar ?? null
  const isFocusedScope = scope !== 'font'

  const scopedSamples = useMemo(() => {
    if (!fontData || !baseline || !isFocusedScope) {
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
  }, [baseline, fontData, isFocusedScope, scopedGlyphs])

  const visibleEvaluations = useMemo(() => {
    if (!radar) {
      return []
    }
    if (isFocusedScope) {
      return scopedGlyphs
        .map((glyph) => radar.evaluationByGlyphId.get(glyph.id))
        .filter(
          (evaluation): evaluation is RadarGlyphEvaluation =>
            evaluation !== undefined
        )
        .sort((left, right) => right.score - left.score)
    }
    return radar.suspects.slice(0, 50)
  }, [isFocusedScope, radar, scopedGlyphs])

  if (!baseline) {
    return (
      <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={6}>
        {isAnalyzing ? (
          <HStack gap={3}>
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
    <Stack gap={4}>
      {!isFocusedScope && radar ? (
        <SimpleGrid columns={{ base: 2, md: 5 }} gap={3}>
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
      ) : !radar ? (
        <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={4}>
          <Text fontSize="sm" color="field.muted">
            漢字樣本不足（需 20 個以上），尚無法建立統計基準。
          </Text>
        </Box>
      ) : null}
      {isFocusedScope ? (
        <Text fontSize="sm" color="field.muted">
          以整套字體現有 {baseline.sampleCount}{' '}
          個漢字推導結構基準，再檢查範圍內的字是否偏離群體統計。
        </Text>
      ) : (
        <Text fontSize="sm" color="field.muted">
          依
          3type《中文字体解密组报告》：每個漢字的真實字面框由最外側的「邊界筆畫」定義，
          以線定義的是<b>框架筆畫</b>（粉紅），以點定義的是<b>樹枝筆畫</b>
          （藍）。 以下基準值由字體現有 {baseline.sampleCount} 個漢字推導：
          各邊兩類筆畫邊距的眾數與 80% 集中區間，可用來檢查新做或新產生的字。
        </Text>
      )}
      <HStack align="flex-start" gap={6} flexWrap="wrap">
        <StructureRangeSvg baseline={baseline} />
        <Stack gap={3} flex={1} minW="260px">
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
              <Stack gap={1}>
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
            <Tag.Root size="sm" w="fit-content">
              左右框架字 lsb−rsb 基準 {baseline.centerOffsetMedian}
            </Tag.Root>
          ) : null}
        </Stack>
      </HStack>
      {isFocusedScope ? (
        <Stack gap={3}>
          <Text fontSize="sm" fontWeight="900">
            範圍內字的邊界筆畫分析（{scopedSamples.length} 個漢字）
          </Text>
          {scopedSamples.length === 0 ? (
            <Box
              borderWidth={1}
              borderColor="field.line"
              bg="field.panel"
              p={4}
            >
              <Text fontSize="sm" color="field.muted">
                檢查範圍內沒有可分析的漢字輪廓。
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
                  <HStack gap={3}>
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
              {isFocusedScope
                ? '範圍內字的離群分析'
                : '最值得人工檢查的字（風險排名）'}
            </Text>
            <HStack gap={2}>
              <Tag.Root
                size="sm"
                colorPalette={radar.suspects.length > 0 ? 'orange' : 'green'}
              >
                {isFocusedScope
                  ? `${visibleEvaluations.filter((entry) => entry.score > 0).length} 個離群`
                  : `${radar.suspects.length} 個可疑字`}
              </Tag.Root>
            </HStack>
          </HStack>
          {visibleEvaluations.length === 0 ? (
            <Box p={4}>
              <Text fontSize="sm" color="field.muted">
                {isFocusedScope
                  ? '檢查範圍內沒有可分析的漢字。'
                  : '沒有偏離群體統計基準的字。'}
              </Text>
            </Box>
          ) : (
            <Stack gap={0} align="stretch">
              {visibleEvaluations.map((evaluation, index) => (
                <SuspectRow
                  key={evaluation.glyphId}
                  evaluation={evaluation}
                  rank={isFocusedScope ? null : index + 1}
                  onLocateGlyph={onLocateGlyph}
                />
              ))}
              <Separator />
              {!isFocusedScope &&
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
