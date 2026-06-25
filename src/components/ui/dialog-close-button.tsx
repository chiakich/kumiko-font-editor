import { CloseButton, Dialog } from '@chakra-ui/react'
import type { CloseButtonProps } from '@chakra-ui/react'

export function DialogCloseButton(props: CloseButtonProps) {
  return (
    <Dialog.CloseTrigger asChild>
      <CloseButton size="sm" zIndex={2} {...props} />
    </Dialog.CloseTrigger>
  )
}
