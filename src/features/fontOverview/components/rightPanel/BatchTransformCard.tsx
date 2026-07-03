import {
  Box,
  Button,
  Heading,
  HStack,
  Stack,
  Text,
  Separator,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { Refresh } from 'iconoir-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ScaleActionGroup,
  SkewIcon,
  TransformActionRow,
  type SkewAxis,
} from 'src/features/common/transform/components/TransformActionControls'
import {
  MirrorControls,
  OffsetControls,
  OriginPicker,
} from 'src/features/common/transform/components/TransformPanelSections'
import {
  buildMirrorUpdates,
  buildRotatedUpdates,
  buildScaledUpdates,
  buildSkewedUpdates,
  getAllNodes,
  getSelectionBounds,
  parseTransformNumber,
  type NodePositionUpdate,
  type SelectionBounds,
  type SelectionNode,
  type TransformOrigin,
} from 'src/features/common/transform/utils/transformGeometry'
import { useStore, activeLayer } from 'src/store'

interface BatchTransformCardProps {
  selectedGlyphIds: string[]
}

type TransformActionField = 'rotate' | 'scaleX' | 'scaleY' | 'skewX' | 'skewY'
type ScaleAxis = 'x' | 'y'

type GlyphUpdateBuilder = (
  nodes: SelectionNode[],
  bounds: SelectionBounds
) => NodePositionUpdate[]

export function BatchTransformCard({
  selectedGlyphIds,
}: BatchTransformCardProps) {
  const { t } = useTranslation()
  const glyphs = useStore((state) => state.fontData?.glyphs)
  const applyBatchNodePositions = useStore(
    (state) => state.applyBatchNodePositions
  )
  const applyBatchOutlineOffset = useStore(
    (state) => state.applyBatchOutlineOffset
  )

  const [origin, setOrigin] = useState<TransformOrigin>({
    x: 'center',
    y: 'middle',
  })
  const [isScaleLocked, setIsScaleLocked] = useState(true)
  const [offsetDraft, setOffsetDraft] = useState('10')
  const [cleanupOverlaps, setCleanupOverlaps] = useState(true)
  const [actionDrafts, setActionDrafts] = useState<
    Record<TransformActionField, string>
  >({
    rotate: '15',
    scaleX: '110',
    scaleY: '110',
    skewX: '10',
    skewY: '10',
  })

  const isDisabled = selectedGlyphIds.length === 0

  // Each glyph transforms around its own bounding-box origin so the chosen
  // origin (top-left, center, ...) is applied relative to each glyph's shape.
  const applyToAll = (build: GlyphUpdateBuilder) => {
    if (isDisabled || !glyphs) {
      return
    }

    const batch = selectedGlyphIds.flatMap((glyphId) => {
      const glyph = glyphs[glyphId]
      if (!glyph) {
        return []
      }

      const nodes = getAllNodes(activeLayer(glyph).paths)
      const bounds = getSelectionBounds(nodes)
      if (!bounds) {
        return []
      }

      const updates = build(nodes, bounds)
      return updates.length > 0 ? [{ glyphId, updates }] : []
    })

    if (batch.length > 0) {
      applyBatchNodePositions(batch)
    }
  }

  const applyMirror = (axis: 'x' | 'y') => {
    applyToAll((nodes, bounds) =>
      buildMirrorUpdates(nodes, bounds, axis, origin)
    )
  }

  const applyRotationStep = (direction: 1 | -1) => {
    const amount = Number.parseFloat(actionDrafts.rotate)
    if (!Number.isFinite(amount) || amount === 0) {
      return
    }
    applyToAll((nodes, bounds) =>
      buildRotatedUpdates(nodes, bounds, amount * direction, origin)
    )
  }

  const applyScaleStep = (axis: ScaleAxis, direction: 1 | -1) => {
    const field = axis === 'x' ? 'scaleX' : 'scaleY'
    const amount = Number.parseFloat(actionDrafts[field])
    if (!Number.isFinite(amount) || amount <= 0 || amount === 100) {
      return
    }

    const factor = direction === 1 ? amount / 100 : 100 / amount
    const scaleX = isScaleLocked || axis === 'x' ? factor : 1
    const scaleY = isScaleLocked || axis === 'y' ? factor : 1
    applyToAll((nodes, bounds) =>
      buildScaledUpdates(nodes, bounds, scaleX, scaleY, origin)
    )
  }

  const applySkewStep = (axis: SkewAxis, direction: 1 | -1) => {
    const field = axis === 'x' ? 'skewX' : 'skewY'
    const amount = Number.parseFloat(actionDrafts[field])
    if (!Number.isFinite(amount) || amount === 0) {
      return
    }
    applyToAll((nodes, bounds) =>
      buildSkewedUpdates(
        nodes,
        bounds,
        axis === 'x' ? amount * direction : 0,
        axis === 'y' ? amount * direction : 0,
        origin
      )
    )
  }

  const applyOffset = (direction: 1 | -1) => {
    const amount = Number.parseFloat(offsetDraft)
    if (isDisabled || !Number.isFinite(amount) || amount === 0) {
      return
    }
    applyBatchOutlineOffset(selectedGlyphIds, amount * direction, {
      cleanup: cleanupOverlaps,
    })
  }

  const setActionDraft = (field: TransformActionField, value: string) => {
    setActionDrafts((current) => ({ ...current, [field]: value }))
  }

  const stepActionDraft = (field: TransformActionField, delta: number) => {
    setActionDrafts((current) => {
      const fallback = field === 'scaleX' || field === 'scaleY' ? '100' : '0'
      const nextValue = String(
        parseTransformNumber(current[field] || fallback) + delta
      )
      if (isScaleLocked && (field === 'scaleX' || field === 'scaleY')) {
        return { ...current, scaleX: nextValue, scaleY: nextValue }
      }
      return { ...current, [field]: nextValue }
    })
  }

  return (
    <Box p={4} bg="card" borderRadius="sm">
      <HStack justify="space-between" align="start" mb={3}>
        <Box>
          <Heading size="sm" textTransform="uppercase" color="foreground">
            {t('editor.transform')}
          </Heading>
          <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
            {t('fontOverview.selection.selectedGlyphs', {
              count: selectedGlyphIds.length,
            })}
          </Text>
        </Box>
      </HStack>
      <Stack gap={4}>
        <Box>
          <OriginPicker
            origin={origin}
            isDisabled={isDisabled}
            onOriginChange={setOrigin}
          />
        </Box>

        <Separator borderColor="muted" />

        <Stack gap={3}>
          <ScaleActionGroup
            scaleX={actionDrafts.scaleX}
            scaleY={actionDrafts.scaleY}
            isDisabled={isDisabled}
            isScaleLocked={isScaleLocked}
            onScaleXChange={(value) => {
              setActionDraft('scaleX', value)
              if (isScaleLocked) setActionDraft('scaleY', value)
            }}
            onScaleYChange={(value) => {
              setActionDraft('scaleY', value)
              if (isScaleLocked) setActionDraft('scaleX', value)
            }}
            onScaleXStep={(delta) => stepActionDraft('scaleX', delta)}
            onScaleYStep={(delta) => stepActionDraft('scaleY', delta)}
            onScaleXDown={() => applyScaleStep('x', -1)}
            onScaleXUp={() => applyScaleStep('x', 1)}
            onScaleYDown={() => applyScaleStep('y', -1)}
            onScaleYUp={() => applyScaleStep('y', 1)}
            onToggleLock={() => setIsScaleLocked((current) => !current)}
          />
          <TransformActionRow
            label={t('editor.rotate')}
            value={actionDrafts.rotate}
            unit="deg"
            isDisabled={isDisabled}
            leftLabel="Rotate counterclockwise"
            rightLabel="Rotate clockwise"
            leftIcon={
              <Refresh
                width={16}
                height={16}
                style={{ transform: 'scaleX(-1)' }}
              />
            }
            rightIcon={<Refresh width={16} height={16} />}
            onChange={(value) => setActionDraft('rotate', value)}
            onStep={(delta) => stepActionDraft('rotate', delta)}
            onLeft={() => applyRotationStep(-1)}
            onRight={() => applyRotationStep(1)}
          />
          <TransformActionRow
            label={t('editor.skewX')}
            value={actionDrafts.skewX}
            unit="deg"
            isDisabled={isDisabled}
            leftLabel="Skew X negative"
            rightLabel="Skew X positive"
            leftIcon={<SkewIcon axis="x" direction={-1} />}
            rightIcon={<SkewIcon axis="x" direction={1} />}
            onChange={(value) => setActionDraft('skewX', value)}
            onStep={(delta) => stepActionDraft('skewX', delta)}
            onLeft={() => applySkewStep('x', -1)}
            onRight={() => applySkewStep('x', 1)}
          />
          <TransformActionRow
            label={t('editor.skewY')}
            value={actionDrafts.skewY}
            unit="deg"
            isDisabled={isDisabled}
            leftLabel="Skew Y negative"
            rightLabel="Skew Y positive"
            leftIcon={<SkewIcon axis="y" direction={1} />}
            rightIcon={<SkewIcon axis="y" direction={-1} />}
            onChange={(value) => setActionDraft('skewY', value)}
            onStep={(delta) => stepActionDraft('skewY', delta)}
            onLeft={() => applySkewStep('y', -1)}
            onRight={() => applySkewStep('y', 1)}
          />

          <OffsetControls
            value={offsetDraft}
            cleanup={cleanupOverlaps}
            isDisabled={isDisabled}
            onChange={setOffsetDraft}
            onStep={(delta) =>
              setOffsetDraft((current) =>
                String(parseTransformNumber(current || '0') + delta)
              )
            }
            onThin={() => applyOffset(-1)}
            onEmbolden={() => applyOffset(1)}
            onCleanupToggle={() => setCleanupOverlaps((current) => !current)}
          />

          <Box>
            <Text
              fontSize="xs"
              color="mutedForeground"
              mb={1}
              fontFamily="mono"
            >
              {t('editor.quick')}
            </Text>
            <Tooltip content={t('editor.rotate90Degrees')}>
              <Button
                aria-label={t('editor.rotate90Degrees')}
                size="sm"
                w="100%"
                disabled={isDisabled}
                onClick={() =>
                  applyToAll((nodes, bounds) =>
                    buildRotatedUpdates(nodes, bounds, 90, origin)
                  )
                }
              >
                <Refresh width={16} height={16} />
                {t('editor.rotateNinety')}
              </Button>
            </Tooltip>
          </Box>
        </Stack>

        <Separator borderColor="muted" />

        <MirrorControls isDisabled={isDisabled} onMirror={applyMirror} />
      </Stack>
    </Box>
  )
}
