import { Buffer } from 'buffer'

// isomorphic-git is written against Node's Buffer and ships no browser-specific
// build, so the global has to exist before any git call runs. Imported for side
// effects by every module that talks to isomorphic-git; because the git stack is
// lazily loaded, the polyfill stays out of the main bundle.
const globalScope = globalThis as typeof globalThis & { Buffer?: unknown }

if (typeof globalScope.Buffer === 'undefined') {
  globalScope.Buffer = Buffer
}

export {}
