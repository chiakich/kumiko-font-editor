import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { QueryClientProvider } from '@tanstack/react-query'
import App from 'src/App.tsx'
import { Toaster } from 'src/components/ui/toaster.tsx'
import { queryClient } from 'src/lib/queryClient.ts'
import {
  applyResolvedColorMode,
  loadColorMode,
} from 'src/lib/preferences/colorMode.ts'
import system from 'src/theme.ts'
import 'src/i18n'
import 'src/global.css'

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
