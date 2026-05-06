import {
  Box,
  Button,
  Divider,
  Grid,
  GridItem,
  Heading,
  IconButton,
  HStack,
  Input,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import {
  AlignBottomBox,
  AlignHorizontalCenters,
  AlignLeftBox,
  AlignRightBox,
  AlignTopBox,
  AlignVerticalCenters,
  ArrowUnion,
  Divide,
  Flip,
  Intersect,
  Mirror,
  RotateCameraRight,
  ScaleFrameEnlarge,
  Substract,
} from 'iconoir-react'
import { useMemo, useState } from 'react'
import type { GlyphData } from '../../../store'
import {
  buildAlignUpdates,
  buildFieldCommitUpdates,
  buildMirrorUpdates,
  buildRotatedUpdates,
  formatTransformNumber,
  getSelectedNodes,
  getSelectionBounds,
  type AlignTarget,
  type NodePositionUpdate,
  type TransformField,
  type TransformOrigin,
} from './transformGeometry'

interface TransformCardProps {
  glyph: GlyphData | null
  selectedNodeIds: string[]
  onMoveSelection: (updates: NodePositionUpdate[]) => void
}

export function TransformCard({
  glyph,
  selectedNodeIds,
  onMoveSelection,
}: TransformCardProps) {
  const selectedNodes = useMemo(
    () => getSelectedNodes(glyph?.paths ?? [], selectedNodeIds),
    [glyph?.paths, selectedNodeIds]
  )
  const bounds = useMemo(
    () => getSelectionBounds(selectedNodes),
    [selectedNodes]
  )
  const [focusedField, setFocusedField] = useState<TransformField | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [origin, setOrigin] = useState<TransformOrigin>({
    x: 'center',
    y: 'middle',
  })
  const [rotationDraft, setRotationDraft] = useState('')
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

  const applyRotation = (value: string) => {
    if (!bounds || selectedNodes.length === 0 || value.trim() === '') {
      return
    }

    const degrees = Number.parseFloat(value)
    if (!Number.isFinite(degrees) || degrees === 0) {
      return
    }

    onMoveSelection(buildRotatedUpdates(selectedNodes, bounds, degrees, origin))
    setRotationDraft('')
  }

  const isDisabled = selectedNodes.length === 0
  const alignButtons: Array<{
    icon: typeof AlignLeftBox
    label: string
    target: AlignTarget
  }> = [
    { icon: AlignLeftBox, label: 'Align left', target: 'left' },
    {
      icon: AlignHorizontalCenters,
      label: 'Align horizontal center',
      target: 'centerX',
    },
    { icon: AlignRightBox, label: 'Align right', target: 'right' },
    { icon: AlignTopBox, label: 'Align top', target: 'top' },
    {
      icon: AlignVerticalCenters,
      label: 'Align vertical middle',
      target: 'middleY',
    },
    { icon: AlignBottomBox, label: 'Align bottom', target: 'bottom' },
  ]
  const pathActions = [
    { icon: ArrowUnion, label: 'Union' },
    { icon: Substract, label: 'Subtract' },
    { icon: Intersect, label: 'Intersect' },
    { icon: Divide, label: 'Divide' },
  ]

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
        <HStack align="start" spacing={4}>
          <Box minW="72px">
            <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
              Origin
            </Text>
            <Grid templateColumns="repeat(3, 18px)" gap="3px">
              {(
                [
                  ['left', 'top'],
                  ['center', 'top'],
                  ['right', 'top'],
                  ['left', 'middle'],
                  ['center', 'middle'],
                  ['right', 'middle'],
                  ['left', 'bottom'],
                  ['center', 'bottom'],
                  ['right', 'bottom'],
                ] as const
              ).map(([x, y]) => {
                const isActive = origin.x === x && origin.y === y
                return (
                  <Tooltip key={`${x}-${y}`} label={`${x} ${y}`}>
                    <Button
                      aria-label={`${x} ${y} origin`}
                      size="xs"
                      minW="18px"
                      h="18px"
                      p={0}
                      borderRadius="1px"
                      variant={isActive ? 'solid' : 'outline'}
                      isDisabled={isDisabled}
                      onClick={() => setOrigin({ x, y })}
                    >
                      <Box
                        w="5px"
                        h="5px"
                        bg={isActive ? 'field.ink' : 'field.muted'}
                      />
                    </Button>
                  </Tooltip>
                )
              })}
            </Grid>
          </Box>

          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3} flex="1">
            {(
              [
                ['x', 'X'],
                ['y', 'Y'],
                ['width', 'W'],
                ['height', 'H'],
              ] as const
            ).map(([field, label]) => (
              <GridItem key={field}>
                <Text
                  fontSize="xs"
                  color="field.muted"
                  mb={1}
                  fontFamily="mono"
                >
                  {label}
                </Text>
                <Input
                  size="sm"
                  type="number"
                  value={
                    focusedField === field ? draftValue : boundsValues[field]
                  }
                  isDisabled={isDisabled}
                  onFocus={() => {
                    setFocusedField(field)
                    setDraftValue(boundsValues[field])
                  }}
                  onChange={(event) =>
                    handleFieldChange(field, event.target.value)
                  }
                  onBlur={() => handleFieldBlur(field)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </GridItem>
            ))}
          </Grid>
        </HStack>

        <Divider borderColor="field.panelMuted" />

        <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
          <GridItem>
            <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
              Rotate
            </Text>
            <HStack spacing={1}>
              <Input
                size="sm"
                type="number"
                placeholder="deg"
                value={rotationDraft}
                isDisabled={isDisabled}
                onChange={(event) => setRotationDraft(event.target.value)}
                onBlur={() => applyRotation(rotationDraft)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <Tooltip label="Rotate selection">
                <IconButton
                  aria-label="Rotate selection"
                  icon={<RotateCameraRight width={16} height={16} />}
                  size="sm"
                  minW={8}
                  isDisabled={isDisabled}
                  onClick={() => applyRotation(rotationDraft || '90')}
                />
              </Tooltip>
            </HStack>
          </GridItem>
          <GridItem>
            <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
              Scale
            </Text>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<ScaleFrameEnlarge width={16} height={16} />}
              isDisabled
              w="100%"
            >
              Percent
            </Button>
          </GridItem>
        </Grid>

        <Divider borderColor="field.panelMuted" />

        <Stack spacing={2}>
          <Text fontSize="xs" color="field.muted" fontFamily="mono">
            Mirror
          </Text>
          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
            <Tooltip label="Mirror horizontally">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Mirror width={16} height={16} />}
                isDisabled={isDisabled}
                onClick={() => applyMirror('x')}
              >
                X
              </Button>
            </Tooltip>
            <Tooltip label="Mirror vertically">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Flip width={16} height={16} />}
                isDisabled={isDisabled}
                onClick={() => applyMirror('y')}
              >
                Y
              </Button>
            </Tooltip>
          </Grid>
        </Stack>

        <Stack spacing={2}>
          <Text fontSize="xs" color="field.muted" fontFamily="mono">
            Align
          </Text>
          <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap={2}>
            {alignButtons.map(({ icon: Icon, label, target }) => (
              <Tooltip key={target} label={label}>
                <IconButton
                  aria-label={label}
                  size="sm"
                  variant="outline"
                  isDisabled={isDisabled}
                  icon={<Icon width={16} height={16} />}
                  onClick={() => applyAlign(target)}
                />
              </Tooltip>
            ))}
          </Grid>
        </Stack>

        <Divider borderColor="field.panelMuted" />

        <Stack spacing={2}>
          <HStack justify="space-between">
            <Text fontSize="xs" color="field.muted" fontFamily="mono">
              Path ops
            </Text>
            <Text fontSize="10px" color="field.muted" fontFamily="mono">
              contour tools next
            </Text>
          </HStack>
          <Grid templateColumns="repeat(4, minmax(0, 1fr))" gap={2}>
            {pathActions.map(({ icon: Icon, label }) => (
              <Tooltip key={label} label={label}>
                <IconButton
                  aria-label={label}
                  icon={<Icon width={16} height={16} />}
                  size="sm"
                  variant="outline"
                  isDisabled
                />
              </Tooltip>
            ))}
          </Grid>
        </Stack>
      </Stack>
    </Box>
  )
}
