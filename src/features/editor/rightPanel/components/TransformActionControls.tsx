import {
  Box,
  Grid,
  IconButton,
  Input,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import { Lock, ScaleFrameEnlarge, ScaleFrameReduce } from 'iconoir-react'
import type { MouseEvent, ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export type SkewAxis = 'x' | 'y'

interface TransformActionRowProps {
  label: string
  value: string
  unit: string
  isDisabled: boolean
  leftLabel: string
  rightLabel: string
  leftIcon: ReactElement
  rightIcon: ReactElement
  onChange: (value: string) => void
  onStep: (delta: number) => void
  onLeft: () => void
  onRight: () => void
}

interface ScaleActionGroupProps {
  scaleX: string
  scaleY: string
  isDisabled: boolean
  isScaleLocked: boolean
  onScaleXChange: (value: string) => void
  onScaleYChange: (value: string) => void
  onScaleXStep: (delta: number) => void
  onScaleYStep: (delta: number) => void
  onScaleXDown: () => void
  onScaleXUp: () => void
  onScaleYDown: () => void
  onScaleYUp: () => void
  onToggleLock: () => void
}

interface ScaleActionLineProps {
  label: string
  value: string
  isDisabled: boolean
  leftLabel: string
  rightLabel: string
  onChange: (value: string) => void
  onStep: (delta: number) => void
  onLeft: () => void
  onRight: () => void
}

export function TransformActionRow({
  label,
  value,
  unit,
  isDisabled,
  leftLabel,
  rightLabel,
  leftIcon,
  rightIcon,
  onChange,
  onStep,
  onLeft,
  onRight,
}: TransformActionRowProps) {
  return (
    <Box>
      <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
        {label}
      </Text>
      <Grid templateColumns="32px 88px 32px" gap={1} justifyContent="center">
        <Tooltip label={leftLabel}>
          <IconButton
            aria-label={leftLabel}
            icon={leftIcon}
            size="sm"
            minW="32px"
            variant="outline"
            isDisabled={isDisabled}
            onClick={onLeft}
          />
        </Tooltip>
        <ActionValueInput
          value={value}
          unit={unit}
          isDisabled={isDisabled}
          onChange={onChange}
          onStep={onStep}
        />
        <Tooltip label={rightLabel}>
          <IconButton
            aria-label={rightLabel}
            icon={rightIcon}
            size="sm"
            minW="32px"
            variant="outline"
            isDisabled={isDisabled}
            onClick={onRight}
          />
        </Tooltip>
      </Grid>
    </Box>
  )
}

export function ScaleActionGroup({
  scaleX,
  scaleY,
  isDisabled,
  isScaleLocked,
  onScaleXChange,
  onScaleYChange,
  onScaleXStep,
  onScaleYStep,
  onScaleXDown,
  onScaleXUp,
  onScaleYDown,
  onScaleYUp,
  onToggleLock,
}: ScaleActionGroupProps) {
  const { t } = useTranslation()

  const isScaleYDisabled = isDisabled || isScaleLocked

  return (
    <Box position="relative">
      <Stack spacing={2}>
        <ScaleActionLine
          label={t('editor.scaleX')}
          value={scaleX}
          isDisabled={isDisabled}
          leftLabel="Scale down X"
          rightLabel="Scale up X"
          onChange={onScaleXChange}
          onStep={onScaleXStep}
          onLeft={onScaleXDown}
          onRight={onScaleXUp}
        />
        <ScaleActionLine
          label={t('editor.scaleY')}
          value={scaleY}
          isDisabled={isScaleYDisabled}
          leftLabel="Scale down Y"
          rightLabel="Scale up Y"
          onChange={onScaleYChange}
          onStep={onScaleYStep}
          onLeft={onScaleYDown}
          onRight={onScaleYUp}
        />
      </Stack>
      <Tooltip
        label={
          isScaleLocked
            ? 'Unlock proportional scale'
            : 'Lock proportional scale'
        }
      >
        <IconButton
          aria-label={
            isScaleLocked
              ? 'Unlock proportional scale'
              : 'Lock proportional scale'
          }
          icon={<Lock width={16} height={16} />}
          position="absolute"
          right="0"
          top="50%"
          size="sm"
          minW="32px"
          variant={isScaleLocked ? 'solid' : 'outline'}
          isDisabled={isDisabled}
          onClick={onToggleLock}
        />
      </Tooltip>
    </Box>
  )
}

function ScaleActionLine({
  label,
  value,
  isDisabled,
  leftLabel,
  rightLabel,
  onChange,
  onStep,
  onLeft,
  onRight,
}: ScaleActionLineProps) {
  return (
    <Box>
      <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
        {label}
      </Text>
      <Grid templateColumns="32px 88px 32px" gap={1} justifyContent="center">
        <Tooltip label={leftLabel}>
          <IconButton
            aria-label={leftLabel}
            icon={<ScaleFrameReduce width={16} height={16} />}
            size="sm"
            minW="32px"
            variant="outline"
            isDisabled={isDisabled}
            onClick={onLeft}
          />
        </Tooltip>
        <ActionValueInput
          value={value}
          unit="%"
          isDisabled={isDisabled}
          onChange={onChange}
          onStep={onStep}
        />
        <Tooltip label={rightLabel}>
          <IconButton
            aria-label={rightLabel}
            icon={<ScaleFrameEnlarge width={16} height={16} />}
            size="sm"
            minW="32px"
            variant="outline"
            isDisabled={isDisabled}
            onClick={onRight}
          />
        </Tooltip>
      </Grid>
    </Box>
  )
}

function ActionValueInput({
  value,
  unit,
  isDisabled,
  onChange,
  onStep,
}: {
  value: string
  unit: string
  isDisabled: boolean
  onChange: (value: string) => void
  onStep: (delta: number) => void
}) {
  const { t } = useTranslation()

  const handleStep = (direction: 1 | -1) => {
    onStep(direction)
  }

  return (
    <Box position="relative">
      <Input
        size="sm"
        type="text"
        inputMode="decimal"
        textAlign="center"
        pr="42px"
        value={value}
        isDisabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
      <Text
        position="absolute"
        top="50%"
        right="25px"
        transform="translateY(-50%)"
        fontSize="10px"
        color="field.muted"
        pointerEvents="none"
      >
        {unit}
      </Text>
      <Box
        position="absolute"
        top="1px"
        right="1px"
        bottom="1px"
        w="18px"
        display="grid"
        gridTemplateRows="1fr 1fr"
        borderLeft="1px solid"
        borderColor="field.panelMuted"
        pointerEvents={isDisabled ? 'none' : 'auto'}
        opacity={isDisabled ? 0.35 : 1}
      >
        <Box
          as="button"
          type="button"
          aria-label={t('editor.incrementActionValue')}
          fontSize="7px"
          lineHeight="1"
          color="field.muted"
          borderTopRightRadius="3px"
          _hover={{ bg: 'field.panelMuted', color: 'field.ink' }}
          onMouseDown={(event: MouseEvent<HTMLButtonElement>) =>
            event.preventDefault()
          }
          onClick={() => handleStep(1)}
        >
          ▲
        </Box>
        <Box
          as="button"
          type="button"
          aria-label={t('editor.decrementActionValue')}
          fontSize="7px"
          lineHeight="1"
          color="field.muted"
          borderBottomRightRadius="3px"
          _hover={{ bg: 'field.panelMuted', color: 'field.ink' }}
          onMouseDown={(event: MouseEvent<HTMLButtonElement>) =>
            event.preventDefault()
          }
          onClick={() => handleStep(-1)}
        >
          ▼
        </Box>
      </Box>
    </Box>
  )
}

export function SkewIcon({
  axis,
  direction,
}: {
  axis: SkewAxis
  direction: 1 | -1
}) {
  const rotation = axis === 'y' ? 90 : 0
  const scale = direction === -1 ? -1 : 1

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 1 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg) scaleX(${scale})` }}
      aria-hidden="true"
    >
      <path d="M5.5 3.5h6l-3 9h-6l3-9Z" />
    </svg>
  )
}
