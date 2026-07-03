import { NativeSelect as ChakraNativeSelect } from '@chakra-ui/react'
import type { ReactNode } from 'react'

export interface NativeSelectProps extends Omit<
  ChakraNativeSelect.RootProps,
  'children'
> {
  children: ReactNode
  fieldProps?: ChakraNativeSelect.FieldProps
  indicatorProps?: ChakraNativeSelect.IndicatorProps
}

export function NativeSelect({
  children,
  fieldProps,
  indicatorProps,
  ...rootProps
}: NativeSelectProps) {
  return (
    <ChakraNativeSelect.Root {...rootProps}>
      <ChakraNativeSelect.Field {...fieldProps}>
        {children}
      </ChakraNativeSelect.Field>
      <ChakraNativeSelect.Indicator {...indicatorProps} />
    </ChakraNativeSelect.Root>
  )
}
