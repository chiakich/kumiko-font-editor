import {
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  IconButton,
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
  Flip,
  Intersect,
  Cut,
  Substract,
  Union,
} from 'iconoir-react'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'
import { SteppedNumberInput } from 'src/features/editor/rightPanel/SteppedNumberInput'
import type {
  AlignTarget,
  TransformField,
  TransformOrigin,
} from 'src/features/editor/rightPanel/transformGeometry'

interface OriginPickerProps {
  origin: TransformOrigin
  isDisabled: boolean
  onOriginChange: (origin: TransformOrigin) => void
}

interface BoundsFieldsProps {
  focusedField: TransformField | null
  draftValue: string
  values: Record<TransformField, string>
  isDisabled: boolean
  onFocus: (field: TransformField) => void
  onFieldChange: (field: TransformField, value: string) => void
  onBlur: (field: TransformField) => void
  onStep: (field: TransformField, delta: number) => void
}

interface TransformFrameControlsProps
  extends OriginPickerProps, Omit<BoundsFieldsProps, 'isDisabled' | 'values'> {
  boundsValues: Record<TransformField, string>
}

interface MirrorControlsProps {
  isDisabled: boolean
  onMirror: (axis: 'x' | 'y') => void
}

interface AlignControlsProps {
  isDisabled: boolean
  onAlign: (target: AlignTarget) => void
}

interface PathOpsControlsProps {
  canApply: boolean
  selectedClosedPathIds: string[]
  onPathOperation: (operation: PathBooleanOperation, pathIds: string[]) => void
}

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

const pathActions: Array<{
  icon: typeof Union
  label: string
  operation: PathBooleanOperation
}> = [
  { icon: Union, label: 'Union', operation: 'union' },
  { icon: Substract, label: 'Subtract', operation: 'subtract' },
  { icon: Intersect, label: 'Intersect', operation: 'intersect' },
  { icon: Cut, label: 'Divide', operation: 'divide' },
]

export function TransformFrameControls({
  origin,
  isDisabled,
  onOriginChange,
  focusedField,
  draftValue,
  boundsValues,
  onFocus,
  onFieldChange,
  onBlur,
  onStep,
}: TransformFrameControlsProps) {
  return (
    <HStack align="start" spacing={4}>
      <OriginPicker
        origin={origin}
        isDisabled={isDisabled}
        onOriginChange={onOriginChange}
      />
      <BoundsFields
        focusedField={focusedField}
        draftValue={draftValue}
        values={boundsValues}
        isDisabled={isDisabled}
        onFocus={onFocus}
        onFieldChange={onFieldChange}
        onBlur={onBlur}
        onStep={onStep}
      />
    </HStack>
  )
}

function OriginPicker({
  origin,
  isDisabled,
  onOriginChange,
}: OriginPickerProps) {
  return (
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
                onClick={() => onOriginChange({ x, y })}
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
  )
}

function BoundsFields({
  focusedField,
  draftValue,
  values,
  isDisabled,
  onFocus,
  onFieldChange,
  onBlur,
  onStep,
}: BoundsFieldsProps) {
  return (
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
          <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
            {label}
          </Text>
          <SteppedNumberInput
            value={focusedField === field ? draftValue : values[field]}
            isDisabled={isDisabled}
            onFocus={() => onFocus(field)}
            onChange={(value) => onFieldChange(field, value)}
            onBlur={() => onBlur(field)}
            onStep={(delta) => onStep(field, delta)}
          />
        </GridItem>
      ))}
    </Grid>
  )
}

export function MirrorControls({ isDisabled, onMirror }: MirrorControlsProps) {
  return (
    <Stack spacing={2}>
      <Text fontSize="xs" color="field.muted" fontFamily="mono">
        Mirror
      </Text>
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        <Tooltip label="Mirror horizontally">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Flip width={16} height={16} transform="rotate(-90)" />}
            isDisabled={isDisabled}
            onClick={() => onMirror('x')}
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
            onClick={() => onMirror('y')}
          >
            Y
          </Button>
        </Tooltip>
      </Grid>
    </Stack>
  )
}

export function AlignControls({ isDisabled, onAlign }: AlignControlsProps) {
  return (
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
              onClick={() => onAlign(target)}
            />
          </Tooltip>
        ))}
      </Grid>
    </Stack>
  )
}

export function PathOpsControls({
  canApply,
  selectedClosedPathIds,
  onPathOperation,
}: PathOpsControlsProps) {
  return (
    <Stack spacing={2}>
      <HStack justify="space-between">
        <Text fontSize="xs" color="field.muted" fontFamily="mono">
          Path ops
        </Text>
        <Text fontSize="10px" color="field.muted" fontFamily="mono">
          {canApply
            ? `${selectedClosedPathIds.length} paths`
            : 'select 2 closed paths'}
        </Text>
      </HStack>
      <Grid templateColumns="repeat(4, minmax(0, 1fr))" gap={2}>
        {pathActions.map(({ icon: Icon, label, operation }) => (
          <Tooltip key={label} label={label}>
            <IconButton
              aria-label={label}
              icon={<Icon width={16} height={16} />}
              size="sm"
              variant="outline"
              isDisabled={!canApply}
              onClick={() => onPathOperation(operation, selectedClosedPathIds)}
            />
          </Tooltip>
        ))}
      </Grid>
    </Stack>
  )
}
