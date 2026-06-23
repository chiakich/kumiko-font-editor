import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'

export const createProjectUiStateSnapshot = (input: KumikoProjectUiState) => ({
  selectedGlyphId: input.selectedGlyphId ?? null,
  selectedLayerId: input.selectedLayerId ?? null,
  activeMasterId: input.activeMasterId ?? null,
  editLocation: input.editLocation ?? null,
  overviewSectionId: input.overviewSectionId ?? null,
  overviewTopGlyphId: input.overviewTopGlyphId ?? null,
  overviewGridState: input.overviewGridState ?? null,
})
