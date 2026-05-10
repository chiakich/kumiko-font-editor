/// <reference lib="webworker" />

import { makeDiagnostic } from 'src/lib/openTypeFeatures/diagnostics'
import type {
  CompileRequestMessage,
  CompileResponseMessage,
} from 'src/lib/openTypeFeatures/compilerTypes'

const makeRuntimeMissingResponse = (
  message: string
): CompileResponseMessage => ({
  type: 'compile-error',
  payload: {
    message,
    diagnostics: [
      makeDiagnostic('error', message, { kind: 'global' }, [
        'compiler-runtime-missing',
      ]),
    ],
  },
})

self.onmessage = async (event: MessageEvent<CompileRequestMessage>) => {
  if (event.data?.type !== 'compile-font-features') {
    return
  }

  self.postMessage(
    makeRuntimeMissingResponse(
      'OpenType feature compilation is not configured yet. Generated FEA can be inspected, but binary layout compilation needs a WASM font compiler runtime.'
    )
  )
}

export {}
