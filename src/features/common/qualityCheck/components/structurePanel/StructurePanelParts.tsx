import {
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import { buildRadarAdvice } from 'src/lib/qualityCheck/radarAdvice'
import {
  formatRadarReason,
  type RadarGlyphEvaluation,
} from 'src/lib/qualityCheck/qualityRadar'
import {
  sideLabels,
  strokeTypeLabels,
  type SideDistribution,
  type StructureBaseline,
  type StructureSide,
} from 'src/lib/qualityCheck/structureMetrics'
import { STRUCTURE_SIDES } from 'src/features/common/qualityCheck/components/structurePanel/structurePanelConstants'

const FRAMING_FILL = 'var(--chakra-colors-pink-200)'
const FRAMING_LINE = 'var(--chakra-colors-pink-500)'
const BRANCHING_FILL = 'var(--chakra-colors-blue-200)'
const BRANCHING_LINE = 'var(--chakra-colors-blue-500)'

export function StructureRangeSvg({
  baseline,
}: {
  baseline: StructureBaseline
}) {
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

export function DistributionRow({
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

export function SuspectRow({
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
              <Tag
                key={reason.key}
                size="sm"
                variant="subtle"
                title={formatRadarReason(reason)}
              >
                {buildRadarAdvice(reason).title}
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

export function GlyphSideTable({ sample }: { sample: GlyphGeometrySample }) {
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

export function RadarScoreTile({
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
