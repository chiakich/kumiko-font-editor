import {
  Grid,
  GridItem,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import {
  AlignBottomBox,
  AlignHorizontalCenters,
  AlignLeftBox,
  AlignRightBox,
  AlignTopBox,
  AlignVerticalCenters,
  Intersect,
  Cut,
  Substract,
  Union,
} from 'iconoir-react'
import type { PathBooleanOperation } from 'src/lib/pathBooleanOperations'
import { SteppedNumberInput } from 'src/features/common/transform/components/SteppedNumberInput'
import { OriginPicker } from 'src/features/common/transform/components/TransformPanelSections'
import type {
  AlignTarget,
  TransformField,
  TransformOrigin,
} from 'src/features/common/transform/utils/transformGeometry'
import { useTranslation } from 'react-i18next'

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

interface TransformFrameControlsProps extends Omit<
  BoundsFieldsProps,
  'isDisabled' | 'values'
> {
  origin: TransformOrigin
  isDisabled: boolean
  onOriginChange: (origin: TransformOrigin) => void
  boundsValues: Record<TransformField, string>
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
    <HStack align="start" gap={4}>
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

export function AlignControls({ isDisabled, onAlign }: AlignControlsProps) {
  const { t } = useTranslation()

  return (
    <Stack gap={2}>
      <Text fontSize="xs" color="field.muted" fontFamily="mono">
        {t('editor.align')}
      </Text>
      <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap={2}>
        {alignButtons.map(({ icon: Icon, label, target }) => (
          <Tooltip key={target} content={label}>
            <IconButton
              aria-label={label}
              size="sm"
              variant="outline"
              disabled={isDisabled}
              onClick={() => onAlign(target)}
            >
              <Icon width={16} height={16} />
            </IconButton>
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
  const { t } = useTranslation()

  return (
    <Stack gap={2}>
      <HStack justify="space-between">
        <Text fontSize="xs" color="field.muted" fontFamily="mono">
          {t('editor.pathOps')}
        </Text>
        <Text fontSize="10px" color="field.muted" fontFamily="mono">
          {canApply
            ? `${selectedClosedPathIds.length} paths`
            : 'select 2 closed paths'}
        </Text>
      </HStack>
      <Grid templateColumns="repeat(4, minmax(0, 1fr))" gap={2}>
        {pathActions.map(({ icon: Icon, label, operation }) => (
          <Tooltip key={label} content={label}>
            <IconButton
              aria-label={label}
              size="sm"
              variant="outline"
              disabled={!canApply}
              onClick={() => onPathOperation(operation, selectedClosedPathIds)}
            >
              <Icon width={16} height={16} />
            </IconButton>
          </Tooltip>
        ))}
      </Grid>
    </Stack>
  )
}
