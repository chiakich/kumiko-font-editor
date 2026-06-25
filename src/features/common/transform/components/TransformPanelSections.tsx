import { Box, Button, Grid, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { Flip } from 'iconoir-react'
import type { TransformOrigin } from 'src/features/common/transform/utils/transformGeometry'
import { useTranslation } from 'react-i18next'

interface OriginPickerProps {
  origin: TransformOrigin
  isDisabled: boolean
  onOriginChange: (origin: TransformOrigin) => void
}

interface MirrorControlsProps {
  isDisabled: boolean
  onMirror: (axis: 'x' | 'y') => void
}

export function OriginPicker({
  origin,
  isDisabled,
  onOriginChange,
}: OriginPickerProps) {
  const { t } = useTranslation()

  return (
    <Box minW="72px">
      <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
        {t('editor.origin')}
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
            <Tooltip key={`${x}-${y}`} content={`${x} ${y}`}>
              <Button
                aria-label={`${x} ${y} origin`}
                size="xs"
                minW="18px"
                h="18px"
                p={0}
                borderRadius="1px"
                variant={isActive ? 'solid' : 'outline'}
                disabled={isDisabled}
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

export function MirrorControls({ isDisabled, onMirror }: MirrorControlsProps) {
  const { t } = useTranslation()

  return (
    <Stack gap={2}>
      <Text fontSize="xs" color="field.muted" fontFamily="mono">
        {t('editor.mirror')}
      </Text>
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
        <Tooltip content={t('editor.mirrorHorizontally')}>
          <Button
            size="sm"
            variant="outline"
            disabled={isDisabled}
            onClick={() => onMirror('x')}
          >
            <Flip width={16} height={16} transform="rotate(-90)" />X
          </Button>
        </Tooltip>
        <Tooltip content={t('editor.mirrorVertically')}>
          <Button
            size="sm"
            variant="outline"
            disabled={isDisabled}
            onClick={() => onMirror('y')}
          >
            <Flip width={16} height={16} />Y
          </Button>
        </Tooltip>
      </Grid>
    </Stack>
  )
}
