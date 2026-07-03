import { Checkbox as ChakraCheckbox } from '@chakra-ui/react'
import type { ComponentProps, ReactNode } from 'react'

export interface CheckboxProps extends ChakraCheckbox.RootProps {
  children?: ReactNode
  controlProps?: ChakraCheckbox.ControlProps
  indicatorProps?: ChakraCheckbox.IndicatorProps
  inputProps?: ComponentProps<typeof ChakraCheckbox.HiddenInput>
}

export function Checkbox({
  children,
  controlProps,
  indicatorProps,
  inputProps,
  ...props
}: CheckboxProps) {
  return (
    <ChakraCheckbox.Root {...props}>
      <ChakraCheckbox.HiddenInput {...inputProps} />
      <ChakraCheckbox.Control {...controlProps}>
        <ChakraCheckbox.Indicator {...indicatorProps} />
      </ChakraCheckbox.Control>
      {children ? (
        <ChakraCheckbox.Label>{children}</ChakraCheckbox.Label>
      ) : null}
    </ChakraCheckbox.Root>
  )
}
