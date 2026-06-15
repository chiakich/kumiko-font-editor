import {
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
} from '@chakra-ui/react'

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
    <FormControl>
      <FormLabel fontSize="sm">{label}</FormLabel>
      <NumberInput min={min} max={max} value={value ?? ''} onChange={onChange}>
        <NumberInputField />
      </NumberInput>
    </FormControl>
  )
}
