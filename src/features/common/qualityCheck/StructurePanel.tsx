import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  SimpleGrid,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import { useMemo } from 'react'
import type { FontData, GlyphData } from 'src/store'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/qualityCheckMode'
import {
  analyzeFontStructure,
  buildStructureGlyphSample,
  checkGlyphStructure,
  isHanGlyph,
  sideLabels,
  strokeTypeLabels,
  type SideDistribution,
  type StructureBaseline,
  type StructureFinding,
  type StructureGlyphSample,
  type StructureSide,
} from 'src/features/common/qualityCheck/structureMetrics'

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

function FindingRow({
  finding,
  onLocateGlyph,
}: {
  finding: StructureFinding
  onLocateGlyph: (glyphId: string) => void
}) {
  return (
    <HStack justify="space-between" align="center" px={3} py={2} spacing={3}>
      <HStack spacing={3} minW={0}>
        <Badge colorScheme={finding.severity === 'warning' ? 'orange' : 'cyan'}>
          {finding.severity === 'warning' ? '警告' : '提示'}
        </Badge>
        <Text fontFamily="glyph" fontSize="lg" lineHeight={1}>
          {finding.character}
        </Text>
        <Text fontSize="sm" color="field.muted" noOfLines={1}>
          {finding.message}
        </Text>
      </HStack>
      <Button
        size="xs"
        variant="outline"
        flexShrink={0}
        onClick={() => onLocateGlyph(finding.glyphId)}
      >
        定位
      </Button>
    </HStack>
  )
}

function GlyphSideTable({ sample }: { sample: StructureGlyphSample }) {
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
  const analysis = useMemo(() => analyzeFontStructure(fontData), [fontData])
  const { baseline } = analysis

  const scopedSamples = useMemo(() => {
    if (!fontData || !baseline || mode !== 'selected') {
      return []
    }
    return scopedGlyphs
      .filter((glyph) => isHanGlyph(glyph))
      .map((glyph) =>
        buildStructureGlyphSample(glyph, fontData, baseline.bodyBox)
      )
      .filter((sample): sample is StructureGlyphSample => sample !== null)
  }, [baseline, fontData, mode, scopedGlyphs])

  const findings = useMemo(() => {
    if (!baseline) {
      return []
    }
    const targetSamples = mode === 'selected' ? scopedSamples : analysis.samples
    return targetSamples
      .flatMap((sample) => checkGlyphStructure(sample, baseline))
      .sort((left, right) =>
        left.severity === right.severity
          ? 0
          : left.severity === 'warning'
            ? -1
            : 1
      )
  }, [analysis.samples, baseline, mode, scopedSamples])

  if (!baseline) {
    return (
      <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={6}>
        <Text fontSize="sm" color="field.muted" fontWeight="800">
          字體中還沒有可分析的漢字輪廓，無法推導結構基準值。
        </Text>
      </Box>
    )
  }

  const warningCount = findings.filter(
    (finding) => finding.severity === 'warning'
  ).length
  const visibleFindings = findings.slice(0, 40)

  return (
    <Stack spacing={4}>
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

      <Box borderWidth={1} borderColor="field.line" bg="field.panel">
        <HStack justify="space-between" px={3} py={2} bg="field.panelMuted">
          <Text fontSize="sm" fontWeight="900">
            {mode === 'selected' ? '選取字結構檢查' : '全字體結構離群字'}
          </Text>
          <HStack spacing={2}>
            <Tag size="sm" colorScheme={warningCount > 0 ? 'orange' : 'green'}>
              {warningCount} 警告
            </Tag>
            <Tag size="sm">{findings.length} 項</Tag>
          </HStack>
        </HStack>
        {visibleFindings.length === 0 ? (
          <Box p={4}>
            <Text fontSize="sm" color="field.muted">
              沒有偏離結構基準的字。
            </Text>
          </Box>
        ) : (
          <Stack spacing={0} divider={<Divider />} align="stretch">
            {visibleFindings.map((finding, index) => (
              <FindingRow
                key={`${finding.glyphId}-${finding.side ?? 'center'}-${index}`}
                finding={finding}
                onLocateGlyph={onLocateGlyph}
              />
            ))}
            {findings.length > visibleFindings.length ? (
              <Text fontSize="xs" color="field.muted" px={3} py={2}>
                其餘 {findings.length - visibleFindings.length} 項已省略。
              </Text>
            ) : null}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}
