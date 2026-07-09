import {
  Badge,
  Box,
  Button,
  chakra,
  HStack,
  SimpleGrid,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import { NavArrowDown, NavArrowRight } from 'iconoir-react'
import type { GlyphData } from 'src/store'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import { buildRadarAdvice } from 'src/lib/qualityCheck/radarAdvice'
import {
  formatRadarReason,
  type RadarGlyphEvaluation,
  type RadarReason,
} from 'src/lib/qualityCheck/qualityRadar'
import {
  sideLabels,
  strokeTypeLabels,
  type SideDistribution,
  type StructureBaseline,
  type StructureSide,
} from 'src/lib/qualityCheck/structureMetrics'
import { STRUCTURE_SIDES } from 'src/features/common/qualityCheck/components/structurePanel/structurePanelConstants'
import { GlyphPreview } from 'src/features/common/glyphPreview/GlyphPreview'

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
    <chakra.svg
      viewBox="-20 -20 1040 1040"
      w="100%"
      maxW="340px"
      color="foreground"
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
    </chakra.svg>
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
    <HStack justify="space-between" gap={3}>
      <Badge colorPalette={colorScheme}>{label}</Badge>
      {distribution ? (
        <Text fontFamily="mono" fontSize="xs">
          眾數 {distribution.mode}・80% {distribution.p10}–{distribution.p90}・
          {distribution.count} 字
        </Text>
      ) : (
        <Text fontFamily="mono" fontSize="xs" color="mutedForeground">
          無樣本
        </Text>
      )}
    </HStack>
  )
}

function GlyphThumb({
  glyph,
  glyphMap,
  character,
  size,
}: {
  glyph: GlyphData | undefined
  glyphMap: Record<string, GlyphData>
  character: string
  size: string
}) {
  return (
    <Box
      w={size}
      h={size}
      flexShrink={0}
      borderWidth={1}
      borderColor="border"
      bg="background"
      color="foreground"
      p="2px"
      overflow="hidden"
    >
      {glyph ? (
        <GlyphPreview glyph={glyph} glyphMap={glyphMap} inheritFallbackColor />
      ) : (
        <Text
          fontFamily="glyph"
          textAlign="center"
          lineHeight={1.6}
          userSelect="none"
        >
          {character}
        </Text>
      )}
    </Box>
  )
}

function SuspectReasonDetail({
  reason,
  glyphMap,
  glyphIdByCharacter,
  onLocateGlyph,
}: {
  reason: RadarReason
  glyphMap: Record<string, GlyphData>
  glyphIdByCharacter: Map<string, string>
  onLocateGlyph: (glyphId: string) => void
}) {
  const advice = buildRadarAdvice(reason)
  const peers = (reason.peerCharacters ?? [])
    .map((character) => ({
      character,
      glyphId: glyphIdByCharacter.get(character),
    }))
    .slice(0, 4)

  return (
    <Box borderWidth={1} borderColor="border" bg="background" p={3}>
      <HStack gap={2} mb={1} flexWrap="wrap">
        <Badge
          colorPalette={advice.severity === 'warning' ? 'orange' : 'gray'}
          flexShrink={0}
        >
          {radarReasonDimensionLabel(reason)}
        </Badge>
        <Text fontSize="sm" fontWeight="900">
          {advice.title}
        </Text>
      </HStack>
      <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
        {advice.detail}
      </Text>
      {advice.action ? (
        <Text fontSize="xs" mt={1}>
          建議：{advice.action}
        </Text>
      ) : null}
      {peers.length > 0 ? (
        <HStack gap={2} mt={2} align="center" flexWrap="wrap">
          <Text fontSize="xs" color="mutedForeground" fontWeight="800">
            同組參照
          </Text>
          {peers.map((peer) => (
            <Stack
              key={peer.character}
              gap={0}
              align="center"
              cursor={peer.glyphId ? 'pointer' : undefined}
              title={
                peer.glyphId ? `開啟「${peer.character}」` : peer.character
              }
              onClick={
                peer.glyphId ? () => onLocateGlyph(peer.glyphId!) : undefined
              }
            >
              <GlyphThumb
                glyph={peer.glyphId ? glyphMap[peer.glyphId] : undefined}
                glyphMap={glyphMap}
                character={peer.character}
                size="36px"
              />
              <Text fontSize="2xs" color="mutedForeground">
                {peer.character}
              </Text>
            </Stack>
          ))}
        </HStack>
      ) : null}
    </Box>
  )
}

const radarReasonDimensionLabel = (reason: RadarReason) =>
  reason.basis === 'reference' ? '參考結構' : '同儕統計'

export function SuspectRow({
  evaluation,
  rank,
  glyphMap,
  glyphIdByCharacter,
  expanded,
  onToggleExpanded,
  onLocateGlyph,
}: {
  evaluation: RadarGlyphEvaluation
  rank: number | null
  glyphMap: Record<string, GlyphData>
  glyphIdByCharacter: Map<string, string>
  expanded: boolean
  onToggleExpanded: (glyphId: string) => void
  onLocateGlyph: (glyphId: string) => void
}) {
  return (
    <Box borderBottomWidth={1} borderColor="border">
      <HStack
        justify="space-between"
        align="center"
        px={3}
        py={2}
        gap={3}
        cursor="pointer"
        _hover={{ bg: 'muted' }}
        onClick={() => onToggleExpanded(evaluation.glyphId)}
      >
        <HStack gap={3} minW={0} align="center">
          <Box color="mutedForeground" flexShrink={0}>
            {expanded ? (
              <NavArrowDown width={14} height={14} />
            ) : (
              <NavArrowRight width={14} height={14} />
            )}
          </Box>
          {rank !== null ? (
            <Text
              fontFamily="mono"
              fontSize="xs"
              color="mutedForeground"
              fontWeight="900"
              w="28px"
            >
              #{rank}
            </Text>
          ) : null}
          <GlyphThumb
            glyph={glyphMap[evaluation.glyphId]}
            glyphMap={glyphMap}
            character={evaluation.character}
            size="44px"
          />
          <Stack gap={1} minW={0}>
            <HStack gap={2}>
              <Text fontFamily="glyph" fontSize="md" lineHeight={1}>
                {evaluation.character}
              </Text>
              <Text fontFamily="mono" fontSize="xs" fontWeight="900">
                {evaluation.glyphName}
              </Text>
              <Tag.Root
                size="sm"
                colorPalette={evaluation.score > 4 ? 'red' : 'orange'}
              >
                風險 {evaluation.score.toFixed(1)}
              </Tag.Root>
            </HStack>
            <HStack gap={1} flexWrap="wrap">
              {evaluation.reasons.slice(0, 3).map((reason) => (
                <Tag.Root
                  key={reason.key}
                  size="sm"
                  variant="subtle"
                  title={formatRadarReason(reason)}
                >
                  {buildRadarAdvice(reason).title}
                </Tag.Root>
              ))}
              {evaluation.reasons.length > 3 ? (
                <Tag.Root size="sm" variant="subtle" color="mutedForeground">
                  +{evaluation.reasons.length - 3}
                </Tag.Root>
              ) : null}
            </HStack>
          </Stack>
        </HStack>
        <Button
          size="xs"
          variant="outline"
          flexShrink={0}
          onClick={(event) => {
            event.stopPropagation()
            onLocateGlyph(evaluation.glyphId)
          }}
        >
          定位
        </Button>
      </HStack>
      {expanded ? (
        <Stack gap={2} px={3} pb={3} pl={12}>
          {evaluation.reasons.slice(0, 4).map((reason) => (
            <SuspectReasonDetail
              key={reason.key}
              reason={reason}
              glyphMap={glyphMap}
              glyphIdByCharacter={glyphIdByCharacter}
              onLocateGlyph={onLocateGlyph}
            />
          ))}
        </Stack>
      ) : null}
    </Box>
  )
}

export function GlyphSideTable({ sample }: { sample: GlyphGeometrySample }) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
      {STRUCTURE_SIDES.map((side) => {
        const sideSample = sample.sides[side]
        return (
          <HStack key={side} justify="space-between" gap={3}>
            <HStack gap={2}>
              <Text fontSize="xs" fontWeight="800" w="34px">
                {sideLabels[side]}
              </Text>
              <Badge
                colorPalette={sideSample.type === 'framing' ? 'pink' : 'blue'}
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
      borderColor={emphasized ? 'foreground' : 'border'}
      bg={`${tone}.50`}
      p={3}
    >
      <Text fontSize="xs" color="mutedForeground" fontWeight="800">
        {label}
      </Text>
      <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
        {score}
      </Text>
      <Text fontSize="xs" color="mutedForeground">
        {detail}
      </Text>
    </Box>
  )
}
