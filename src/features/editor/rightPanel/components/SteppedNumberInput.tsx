import { Box, Input } from '@chakra-ui/react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface SteppedNumberInputProps {
  value: string
  placeholder?: string
  isDisabled?: boolean
  step?: number
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onStep: (delta: number) => void
}

export function SteppedNumberInput({
  value,
  placeholder,
  isDisabled,
  step = 1,
  onChange,
  onFocus,
  onBlur,
  onStep,
}: SteppedNumberInputProps) {
  const { t } = useTranslation()

  const handleStep = (direction: 1 | -1) => {
    onStep(step * direction)
  }

  return (
    <Box position="relative">
      <Input
        size="sm"
        type="text"
        inputMode="decimal"
        pr="24px"
        step={step}
        value={value}
        placeholder={placeholder}
        isDisabled={isDisabled}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
      <Box
        position="absolute"
        top="1px"
        right="1px"
        bottom="1px"
        w="20px"
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
          aria-label={t('editor.incrementValue')}
          fontSize="8px"
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
          aria-label={t('editor.decrementValue')}
          fontSize="8px"
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
