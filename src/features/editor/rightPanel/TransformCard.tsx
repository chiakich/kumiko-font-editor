import {
  Box,
  Button,
  Divider,
  Heading,
  HStack,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import { Refresh } from 'iconoir-react'
import { useMemo, useState } from 'react'
import type { GlyphData } from 'src/store'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'
import {
  ScaleActionGroup,
  SkewIcon,
  TransformActionRow,
  type SkewAxis,
} from 'src/features/editor/rightPanel/TransformActionControls'
import {
  AlignControls,
  MirrorControls,
  PathOpsControls,
  TransformFrameControls,
} from 'src/features/editor/rightPanel/TransformPanelSections'
import {
  buildAlignUpdates,
  buildFieldCommitUpdates,
  buildMirrorUpdates,
  buildRotatedUpdates,
  buildScaledUpdates,
  buildSkewedUpdates,
  formatTransformNumber,
  getSelectedNodes,
  getSelectionBounds,
  parseTransformNumber,
  type AlignTarget,
  type NodePositionUpdate,
  type TransformField,
  type TransformOrigin,
} from 'src/features/editor/rightPanel/transformGeometry'

interface TransformCardProps {
  glyph: GlyphData | null
  selectedNodeIds: string[]
  onMoveSelection: (updates: NodePositionUpdate[]) => void
  onPathOperation: (operation: PathBooleanOperation, pathIds: string[]) => void
}

type TransformActionField = 'rotate' | 'scaleX' | 'scaleY' | 'skewX' | 'skewY'
type ScaleAxis = 'x' | 'y'

export function TransformCard({
  glyph,
  selectedNodeIds,
  onMoveSelection,
  onPathOperation,
}: TransformCardProps) {
  const selectedNodes = useMemo(
    () => getSelectedNodes(glyph?.paths ?? [], selectedNodeIds),
    [glyph?.paths, selectedNodeIds]
  )
  const bounds = useMemo(
    () => getSelectionBounds(selectedNodes),
    [selectedNodes]
  )
  const selectedClosedPathIds = useMemo(() => {
    const selectedPathIds = new Set(
      selectedNodeIds.flatMap((selectionKey) => {
        const [pathId] = selectionKey.split(':')
        return pathId ? [pathId] : []
      })
    )
    return (glyph?.paths ?? [])
      .filter((path) => selectedPathIds.has(path.id) && path.closed)
      .map((path) => path.id)
  }, [glyph?.paths, selectedNodeIds])
  const [focusedField, setFocusedField] = useState<TransformField | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [origin, setOrigin] = useState<TransformOrigin>({
    x: 'center',
    y: 'middle',
  })
  const [isScaleLocked, setIsScaleLocked] = useState(true)
  const [actionDrafts, setActionDrafts] = useState<
    Record<TransformActionField, string>
  >({
    rotate: '15',
    scaleX: '110',
    scaleY: '110',
    skewX: '10',
    skewY: '10',
  })
  const boundsValues = useMemo(
    () => ({
      x: formatTransformNumber(bounds?.xMin),
      y: formatTransformNumber(bounds?.yMin),
      width: formatTransformNumber(bounds?.width),
      height: formatTransformNumber(bounds?.height),
    }),
    [bounds]
  )

  const commitField = (field: TransformField, value: string) => {
    if (!bounds || selectedNodes.length === 0 || value.trim() === '') {
      return
    }

    const updates = buildFieldCommitUpdates(
      field,
      value,
      selectedNodes,
      bounds,
      origin
    )
    if (updates.length > 0) {
      onMoveSelection(updates)
    }
  }

  const handleFieldChange = (field: TransformField, value: string) => {
    void field
    setDraftValue(value)
  }

  const handleFieldBlur = (field: TransformField) => {
    setFocusedField(null)
    commitField(field, draftValue)
    setDraftValue('')
  }

  const stepField = (field: TransformField, delta: number) => {
    const currentValue =
      focusedField === field ? draftValue : boundsValues[field]
    const nextValue = String(parseTransformNumber(currentValue) + delta)
    if (focusedField === field) {
      setDraftValue(nextValue)
    }
    commitField(field, nextValue)
  }

  const applyMirror = (axis: 'x' | 'y') => {
    if (!bounds || selectedNodes.length === 0) {
      return
    }

    onMoveSelection(buildMirrorUpdates(selectedNodes, bounds, axis, origin))
  }

  const applyAlign = (target: AlignTarget) => {
    if (!bounds || selectedNodes.length === 0) {
      return
    }

    onMoveSelection(buildAlignUpdates(selectedNodes, bounds, target))
  }

  const applyRotationStep = (direction: 1 | -1) => {
    if (!bounds || selectedNodes.length === 0) {
      return
    }

    const amount = Number.parseFloat(actionDrafts.rotate)
    if (!Number.isFinite(amount) || amount === 0) {
      return
    }

    onMoveSelection(
      buildRotatedUpdates(selectedNodes, bounds, amount * direction, origin)
    )
  }

  const applyScaleStep = (axis: ScaleAxis, direction: 1 | -1) => {
    if (!bounds || selectedNodes.length === 0) {
      return
    }

    const field = axis === 'x' ? 'scaleX' : 'scaleY'
    const amount = Number.parseFloat(actionDrafts[field])
    if (!Number.isFinite(amount) || amount <= 0 || amount === 100) {
      return
    }

    const factor = direction === 1 ? amount / 100 : 100 / amount
    const scaleX = isScaleLocked || axis === 'x' ? factor : 1
    const scaleY = isScaleLocked || axis === 'y' ? factor : 1
    onMoveSelection(
      buildScaledUpdates(selectedNodes, bounds, scaleX, scaleY, origin)
    )
  }

  const applySkewStep = (axis: SkewAxis, direction: 1 | -1) => {
    if (!bounds || selectedNodes.length === 0) {
      return
    }

    const field = axis === 'x' ? 'skewX' : 'skewY'
    const amount = Number.parseFloat(actionDrafts[field])
    if (!Number.isFinite(amount) || amount === 0) {
      return
    }

    onMoveSelection(
      buildSkewedUpdates(
        selectedNodes,
        bounds,
        axis === 'x' ? amount * direction : 0,
        axis === 'y' ? amount * direction : 0,
        origin
      )
    )
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
        return {
          ...current,
          scaleX: nextValue,
          scaleY: nextValue,
        }
      }
      return {
        ...current,
        [field]: nextValue,
      }
    })
  }

  const isDisabled = selectedNodes.length === 0
  const canApplyPathOps = selectedClosedPathIds.length >= 2

  return (
    <Box p={4} bg="field.panel" borderRadius="sm">
      <HStack justify="space-between" align="start" mb={3}>
        <Box>
          <Heading size="sm" textTransform="uppercase" color="field.ink">
            Transform
          </Heading>
          <Text fontSize="xs" color="field.muted" fontFamily="mono">
            {selectedNodes.length > 0
              ? `${selectedNodes.length} nodes selected`
              : 'No editable selection'}
          </Text>
        </Box>
      </HStack>

      <Stack spacing={4}>
        <TransformFrameControls
          origin={origin}
          isDisabled={isDisabled}
          onOriginChange={setOrigin}
          focusedField={focusedField}
          draftValue={draftValue}
          boundsValues={boundsValues}
          onFocus={(field) => {
            setFocusedField(field)
            setDraftValue(boundsValues[field])
          }}
          onFieldChange={handleFieldChange}
          onBlur={handleFieldBlur}
          onStep={stepField}
        />

        <Divider borderColor="field.panelMuted" />

        <Stack spacing={3}>
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
            label="Rotate"
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
            label="Skew X"
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
            label="Skew Y"
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

          <Box>
            <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
              Quick
            </Text>
            <Tooltip label="Rotate 90 degrees">
              <Button
                aria-label="Rotate 90 degrees"
                leftIcon={<Refresh width={16} height={16} />}
                size="sm"
                w="100%"
                isDisabled={isDisabled}
                onClick={() =>
                  onMoveSelection(
                    bounds
                      ? buildRotatedUpdates(selectedNodes, bounds, 90, origin)
                      : []
                  )
                }
              >
                Rotate 90°
              </Button>
            </Tooltip>
          </Box>
        </Stack>

        <Divider borderColor="field.panelMuted" />

        <MirrorControls isDisabled={isDisabled} onMirror={applyMirror} />

        <AlignControls isDisabled={isDisabled} onAlign={applyAlign} />

        <Divider borderColor="field.panelMuted" />

        <PathOpsControls
          canApply={canApplyPathOps}
          selectedClosedPathIds={selectedClosedPathIds}
          onPathOperation={onPathOperation}
        />
      </Stack>
    </Box>
  )
}
