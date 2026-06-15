export const UFO_LOCAL_TARGET_KEY = 'localSaveTarget'
export const UFO_LOCAL_MANIFEST_KEY = 'localSaveManifest'

export const parseSelectedNode = (selectedNodeId: string | undefined) => {
  if (!selectedNodeId) {
    return null
  }

  const [pathId, nodeId] = selectedNodeId.split(':')
  if (!pathId || !nodeId) {
    return null
  }

  return { pathId, nodeId }
}

export const parseNumberInput = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}
