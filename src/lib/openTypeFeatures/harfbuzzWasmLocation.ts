const getNodeWorkingDirectory = () => {
  const maybeProcess = (
    globalThis as {
      process?: { cwd?: () => string; versions?: { node?: string } }
    }
  ).process

  return maybeProcess?.versions?.node ? maybeProcess.cwd?.() : undefined
}

export const resolveHarfBuzzWasmLocation = (wasmUrl: string) => {
  const nodeCwd = getNodeWorkingDirectory()

  if (nodeCwd && wasmUrl.startsWith('/node_modules/')) {
    return `${nodeCwd}${wasmUrl}`
  }

  return wasmUrl
}
