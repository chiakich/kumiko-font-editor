import { NumberInput, Field } from '@chakra-ui/react'

interface NumberFieldProps {
  label: string
  min?: number
  max?: number
  value: string | number | undefined
  onChange: (value: string) => void
}

export function NumberField({
  label,
  min,
  max,
  value,
  onChange,
}: NumberFieldProps) {
  return (
    <Field.Root>
      <Field.Label textStyle="label">{label}</Field.Label>
      <NumberInput.Root
        min={min}
        max={max}
        value={String(value ?? '')}
        onValueChange={(details) => onChange(details.value)}
      >
        <NumberInput.Input
          bg="card"
          borderColor="controlBorder"
          borderRadius="control"
          color="foreground"
          fontFamily="mono"
          fontSize="sm"
          h={9}
          lineHeight="normal"
          px={3}
          transitionDuration="fast"
          transitionProperty="border-color, box-shadow"
          transitionTimingFunction="standard"
          _disabled={{ opacity: 0.5, cursor: 'not-allowed', bg: 'secondary' }}
          _focusVisible={{
            borderColor: 'ring',
            boxShadow: '0 0 0 1px var(--chakra-colors-ring)',
          }}
          _hover={{ borderColor: 'controlBorderHover' }}
        />
      </NumberInput.Root>
    </Field.Root>
  )
}
