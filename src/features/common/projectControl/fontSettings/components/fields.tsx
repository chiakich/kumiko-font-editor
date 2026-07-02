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
        <NumberInput.Input />
      </NumberInput.Root>
    </Field.Root>
  )
}
