import { vi } from 'vitest'

// paper.js sets up a canvas 2D context at import time, which happy-dom cannot
// provide. UI tests never exercise the boolean-path operations that need it.
export const mockPaper = () =>
  vi.mock('paper', () => ({ default: {}, paper: {} }))
