import {
  Badge,
  Box,
  chakra,
  Button,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { NavArrowLeft, NavArrowRight } from 'iconoir-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KeyboardEvent } from 'react'
import { SteppedNumberInput } from 'src/features/common/transform/components/SteppedNumberInput'
import {
  getMasterKerningPairs,
  buildKerningGroupMaps,
  describeKerningSelector,
  resolveKerningPair,
  type KerningPairPriority,
} from 'src/lib/kerning/resolveKerning'
import type { GlyphSelector } from 'src/lib/openTypeFeatures'
import { buildPairSpacingLayout } from 'src/features/editor/rightPanel/kerning/pairSpacingLayout'
import { getTextKerningValue } from 'src/features/editor/canvas/workspace/layout/textKerning'
import { useStore, type FontData } from 'src/store'

const STEP_OPTIONS = [1, 5, 10]

const PRIORITY_LABELS: Record<KerningPairPriority, string> = {
  'glyph-glyph': 'glyph + glyph',
  'glyph-group': 'glyph + group',
  'group-glyph': 'group + glyph',
  'group-group': 'group + group',
  none: '—',
}

interface KerningPairInspectorProps {
  fontData: FontData
}

export function KerningPairInspector({ fontData }: KerningPairInspectorProps) {
  const { t } = useTranslation()

  const editorGlyphIds = useStore((state) => state.editorGlyphIds)
  const editorActiveGlyphIndex = useStore(
    (state) => state.editorActiveGlyphIndex
  )
  const setEditorActiveGlyphIndex = useStore(
    (state) => state.setEditorActiveGlyphIndex
  )
  const upsertKerningPair = useStore((state) => state.upsertKerningPair)
  const deleteKerningPair = useStore((state) => state.deleteKerningPair)
  const activeMasterId = useStore((state) => state.activeMasterId)

  const [step, setStep] = useState(5)
  const [draftValue, setDraftValue] = useState<string | null>(null)

  const pairIndex = Math.min(
    Math.max(editorActiveGlyphIndex, 1),
    editorGlyphIds.length - 1
  )
  const leftGlyphId = editorGlyphIds[pairIndex - 1] ?? null
  const rightGlyphId = editorGlyphIds[pairIndex] ?? null

  const maps = useMemo(
    () => buildKerningGroupMaps(fontData.kerningGroups),
    [fontData.kerningGroups]
  )
  // Inspect and edit the active master's pair values (per-master kerning).
  const masterKerning = useMemo(
    () => ({
      kerningGroups: fontData.kerningGroups,
      kerningPairs: getMasterKerningPairs(fontData, activeMasterId),
    }),
    [fontData, activeMasterId]
  )
  const resolved = useMemo(
    () =>
      leftGlyphId && rightGlyphId
        ? resolveKerningPair(masterKerning, leftGlyphId, rightGlyphId)
        : null,
    [masterKerning, leftGlyphId, rightGlyphId]
  )
  const classFallback = useMemo(
    () =>
      leftGlyphId && rightGlyphId && resolved?.priority === 'glyph-glyph'
        ? resolveKerningPair(masterKerning, leftGlyphId, rightGlyphId, {
            ignoreGlyphPair: true,
          })
        : null,
    [masterKerning, leftGlyphId, rightGlyphId, resolved?.priority]
  )

  if (editorGlyphIds.length < 2 || !leftGlyphId || !rightGlyphId || !resolved) {
    return (
      <KerningCard title={t('editor.kerningCurrentPair')}>
        <Text fontSize="xs" color="mutedForeground" px={3} py={3}>
          {t('editor.kerningNoPairHint')}
        </Text>
      </KerningCard>
    )
  }

  // Where an edit will land: the resolved pair, or a new pair created from
  // each glyph's own kerning group (falling back to the glyph itself).
  const targetLeft: GlyphSelector = resolved.pair
    ? resolved.pair.left
    : maps.leftGroupByGlyph.has(leftGlyphId)
      ? { kind: 'class', classId: maps.leftGroupByGlyph.get(leftGlyphId)!.id }
      : { kind: 'glyph', glyph: leftGlyphId }
  const targetRight: GlyphSelector = resolved.pair
    ? resolved.pair.right
    : maps.rightGroupByGlyph.has(rightGlyphId)
      ? { kind: 'class', classId: maps.rightGroupByGlyph.get(rightGlyphId)!.id }
      : { kind: 'glyph', glyph: rightGlyphId }

  const commitValue = (value: number) => {
    if (!Number.isFinite(value)) return
    upsertKerningPair(targetLeft, targetRight, Math.round(value))
    setDraftValue(null)
  }

  const stepValue = (delta: number) => {
    commitValue(
      (draftValue !== null ? Number(draftValue) || 0 : resolved.value) + delta
    )
  }

  const handleValueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      stepValue(event.key === 'ArrowUp' ? step : -step)
    }
  }

  const isClassPair =
    resolved.priority === 'glyph-group' ||
    resolved.priority === 'group-glyph' ||
    resolved.priority === 'group-group'
  const canRevertToClass =
    resolved.priority === 'glyph-glyph' &&
    classFallback !== null &&
    classFallback.priority !== 'none'

  return (
    <KerningCard title={t('editor.kerningCurrentPair')}>
      <Stack gap={3} px={3} py={3}>
        <HStack justify="center" gap={2}>
          <IconButton
            aria-label={t('editor.kerningPrevPair')}
            size="xs"
            variant="ghost"
            disabled={pairIndex <= 1}
            onClick={() => setEditorActiveGlyphIndex(pairIndex - 1)}
          >
            <NavArrowLeft width={14} height={14} aria-hidden="true" />
          </IconButton>
          <PairSpacingPreview
            fontData={fontData}
            leftGlyphId={leftGlyphId}
            rightGlyphId={rightGlyphId}
          />
          <Text
            fontSize="sm"
            fontFamily="mono"
            color={resolved.value < 0 ? 'red.500' : 'mutedForeground'}
            minW="44px"
            textAlign="center"
          >
            {resolved.priority === 'none' ? '±0' : resolved.value}
          </Text>
          <IconButton
            aria-label={t('editor.kerningNextPair')}
            size="xs"
            variant="ghost"
            disabled={pairIndex >= editorGlyphIds.length - 1}
            onClick={() => setEditorActiveGlyphIndex(pairIndex + 1)}
          >
            <NavArrowRight width={14} height={14} aria-hidden="true" />
          </IconButton>
        </HStack>

        <HStack gap={2} align="center">
          <Box flex="1" onKeyDown={handleValueKeyDown}>
            <SteppedNumberInput
              value={draftValue ?? String(resolved.value)}
              step={step}
              onChange={setDraftValue}
              onBlur={() => {
                if (draftValue === null) return
                const parsed = Number(draftValue)
                if (Number.isFinite(parsed)) {
                  commitValue(parsed)
                } else {
                  setDraftValue(null)
                }
              }}
              onStep={stepValue}
            />
          </Box>
          <HStack gap={1}>
            {STEP_OPTIONS.map((option) => (
              <Button
                key={option}
                size="2xs"
                variant={step === option ? 'solid' : 'outline'}
                onClick={() => setStep(option)}
              >
                {option}
              </Button>
            ))}
          </HStack>
        </HStack>

        <HStack gap={2} flexWrap="wrap">
          <Badge colorPalette={resolved.priority === 'none' ? 'gray' : 'blue'}>
            {PRIORITY_LABELS[resolved.priority]}
          </Badge>
          <Text fontSize="xs" fontFamily="mono" color="mutedForeground">
            {describeKerningSelector(targetLeft, maps)} +{' '}
            {describeKerningSelector(targetRight, maps)}
          </Text>
        </HStack>

        {resolved.overriddenPair ? (
          <Text fontSize="xs" color="mutedForeground">
            {t('editor.kerningOverridesClassPair', {
              pair: `${describeKerningSelector(resolved.overriddenPair.left, maps)} + ${describeKerningSelector(resolved.overriddenPair.right, maps)}`,
              value: resolved.overriddenPair.value,
            })}
          </Text>
        ) : null}

        <HStack gap={2}>
          {isClassPair ? (
            <Tooltip content={t('editor.kerningCreateExceptionHint')}>
              <Button
                size="2xs"
                variant="outline"
                onClick={() =>
                  upsertKerningPair(
                    { kind: 'glyph', glyph: leftGlyphId },
                    { kind: 'glyph', glyph: rightGlyphId },
                    resolved.value
                  )
                }
              >
                {t('editor.kerningCreateException')}
              </Button>
            </Tooltip>
          ) : null}
          {canRevertToClass ? (
            <Tooltip
              content={t('editor.kerningRevertToClassHint', {
                value: classFallback?.value ?? 0,
              })}
            >
              <Button
                size="2xs"
                variant="outline"
                onClick={() =>
                  deleteKerningPair(
                    { kind: 'glyph', glyph: leftGlyphId },
                    { kind: 'glyph', glyph: rightGlyphId }
                  )
                }
              >
                {t('editor.kerningRevertToClass')}
              </Button>
            </Tooltip>
          ) : null}
          {resolved.priority === 'glyph-glyph' && !canRevertToClass ? (
            <Button
              size="2xs"
              variant="outline"
              onClick={() =>
                deleteKerningPair(
                  { kind: 'glyph', glyph: leftGlyphId },
                  { kind: 'glyph', glyph: rightGlyphId }
                )
              }
            >
              {t('editor.kerningDeletePair')}
            </Button>
          ) : null}
        </HStack>
      </Stack>
    </KerningCard>
  )
}

// The pair as the canvas lays it out: outlines and advances straight from the
// project, offset by the same kerning the canvas resolves. No font compile —
// the value being edited is already the only unknown.
function PairSpacingPreview({
  fontData,
  leftGlyphId,
  rightGlyphId,
}: {
  fontData: FontData
  leftGlyphId: string
  rightGlyphId: string
}) {
  const activeMasterId = useStore((state) => state.activeMasterId)
  // Resolve the spacing exactly as the canvas does, GPOS fallback included —
  // the panel showing '±0' for a pair the canvas already kerns from an
  // imported kern feature is the disagreement this preview exists to avoid.
  const layout = useMemo(
    () =>
      buildPairSpacingLayout(
        fontData,
        leftGlyphId,
        rightGlyphId,
        activeMasterId,
        getTextKerningValue(fontData, leftGlyphId, rightGlyphId, activeMasterId)
      ),
    [fontData, leftGlyphId, rightGlyphId, activeMasterId]
  )

  if (!layout) {
    return null
  }

  return (
    <chakra.svg
      viewBox={layout.viewBox}
      width="100%"
      height="52px"
      maxW="160px"
      preserveAspectRatio="xMidYMid meet"
      overflow="hidden"
      color="foreground"
    >
      <g transform={`matrix(1 0 0 -1 0 ${layout.flipY})`}>
        {layout.glyphs.map((entry) => (
          <g
            key={entry.key}
            transform={`translate(${entry.offsetX} 0)`}
            opacity={entry.isGhost ? 0.22 : 1}
          >
            {entry.shapes.map((shape, index) => (
              <path
                key={`${entry.key}-${index}`}
                d={shape.d}
                transform={shape.transform}
                fill="currentColor"
                stroke="none"
              />
            ))}
          </g>
        ))}
      </g>
    </chakra.svg>
  )
}

export function KerningCard({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Box borderWidth="1px" borderColor="border" bg="card">
      <HStack
        justify="space-between"
        px={3}
        py={2}
        bg="muted"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Text fontSize="xs" fontWeight="bold">
          {title}
        </Text>
        {actions}
      </HStack>
      {children}
    </Box>
  )
}
