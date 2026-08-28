import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Auto-cleanup only registers itself when vitest globals are on; they're off
// in this repo, so unmount between tests explicitly.
afterEach(cleanup)
import { ChakraProvider } from '@chakra-ui/react'
import type { ReactElement } from 'react'
import system from 'src/theme'
import i18n from 'src/i18n'

// Chakra needs its provider; i18n gets pinned to zh-TW so queries match what
// users see regardless of the test environment's navigator.language.
void i18n.changeLanguage('zh-TW')

export const renderWithProviders = (ui: ReactElement) =>
  render(<ChakraProvider value={system}>{ui}</ChakraProvider>)
