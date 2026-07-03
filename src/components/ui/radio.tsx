import { RadioGroup } from '@chakra-ui/react'
import type { ComponentProps, ReactNode } from 'react'

export interface RadioItemProps extends RadioGroup.ItemProps {
  children: ReactNode
  controlProps?: RadioGroup.ItemControlProps
  inputProps?: ComponentProps<typeof RadioGroup.ItemHiddenInput>
}

export function RadioItem({
  children,
  controlProps,
  inputProps,
  ...props
}: RadioItemProps) {
  return (
    <RadioGroup.Item {...props}>
      <RadioGroup.ItemHiddenInput {...inputProps} />
      <RadioGroup.ItemControl {...controlProps} />
      {children}
    </RadioGroup.Item>
  )
}
