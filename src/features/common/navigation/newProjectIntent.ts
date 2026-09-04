const newProjectAddGlyphModalProjectIds = new Set<string>()

export const requestAddGlyphModalForNewProject = (projectId: string) => {
  newProjectAddGlyphModalProjectIds.add(projectId)
}

export const consumeAddGlyphModalForNewProject = (projectId: string | null) => {
  if (!projectId || !newProjectAddGlyphModalProjectIds.has(projectId)) {
    return false
  }

  newProjectAddGlyphModalProjectIds.delete(projectId)
  return true
}
