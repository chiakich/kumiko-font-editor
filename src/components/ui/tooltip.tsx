import { Portal, Tooltip as ChakraTooltip } from '@chakra-ui/react'
import type { ReactNode } from 'react'

interface TooltipProps extends Omit<
  ChakraTooltip.RootProps,
  'content' | 'children'
> {
  children: ReactNode
  content: ReactNode
  showArrow?: boolean
  disabled?: boolean
}

export function Tooltip({
  children,
  content,
  showArrow = true,
  disabled,
  openDelay = 400,
  closeDelay = 100,
  ...rootProps
}: TooltipProps) {
  if (disabled || content == null) {
    return <>{children}</>
  }

  return (
    <ChakraTooltip.Root
      openDelay={openDelay}
      closeDelay={closeDelay}
      {...rootProps}
    >
      <ChakraTooltip.Trigger asChild>{children}</ChakraTooltip.Trigger>
      <Portal>
        <ChakraTooltip.Positioner>
          <ChakraTooltip.Content>
            {showArrow ? (
              <ChakraTooltip.Arrow>
                <ChakraTooltip.ArrowTip />
              </ChakraTooltip.Arrow>
            ) : null}
            {content}
          </ChakraTooltip.Content>
        </ChakraTooltip.Positioner>
      </Portal>
    </ChakraTooltip.Root>
  )
}
