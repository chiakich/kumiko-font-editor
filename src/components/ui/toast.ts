import { createToaster } from '@chakra-ui/react'
import type { ReactNode } from 'react'

type ToastStatus = 'success' | 'error' | 'loading' | 'info' | 'warning'

interface LegacyToastOptions {
  id?: string
  title?: ReactNode
  description?: ReactNode
  status?: ToastStatus
  type?: ToastStatus
  duration?: number
  isClosable?: boolean
  closable?: boolean
}

export const toaster = createToaster({
  placement: 'bottom-end',
  pauseOnPageIdle: true,
})

export function useToast() {
  return ({
    status,
    type,
    isClosable,
    closable,
    ...options
  }: LegacyToastOptions) =>
    toaster.create({
      ...options,
      type: type ?? status,
      closable: closable ?? isClosable,
    })
}
