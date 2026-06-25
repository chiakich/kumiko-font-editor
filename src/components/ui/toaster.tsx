import {
  Portal,
  Spinner,
  Stack,
  Toast,
  Toaster as ChakraToaster,
} from '@chakra-ui/react'
import { toaster } from '@/components/ui/toast'

export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster}>
        {(toast) => (
          <Toast.Root>
            {toast.type === 'loading' ? (
              <Spinner size="sm" />
            ) : (
              <Toast.Indicator />
            )}
            <Stack gap="1" flex="1" maxW="100%">
              {toast.title ? <Toast.Title>{toast.title}</Toast.Title> : null}
              {toast.description ? (
                <Toast.Description>{toast.description}</Toast.Description>
              ) : null}
            </Stack>
            {toast.action ? (
              <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
            ) : null}
            {toast.closable ? <Toast.CloseTrigger /> : null}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  )
}
