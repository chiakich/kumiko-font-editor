import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import App from '@/App.tsx'
import { Toaster } from '@/components/ui/toaster.tsx'
import { queryClient } from '@/lib/queryClient.ts'
import {
  applyResolvedColorMode,
  loadColorMode,
} from '@/lib/preferences/colorMode.ts'
import system from '@/theme.ts'
import '@/i18n'
import '@/global.css'

// Apply the stored color mode before the first paint to avoid a light→dark flash.
applyResolvedColorMode(loadColorMode())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={system}>
        <App />
        <Toaster />
      </ChakraProvider>
    </QueryClientProvider>
  </StrictMode>
)
