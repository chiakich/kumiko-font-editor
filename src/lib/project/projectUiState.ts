import type { KumikoProjectUiState } from 'src/lib/project/projectTypes'
import { normalizeOverviewCustomFilters } from 'src/lib/glyph/glyphOverview'

export const createProjectUiStateSnapshot = (input: KumikoProjectUiState) => ({
  selectedGlyphId: input.selectedGlyphId ?? null,
  selectedLayerId: input.selectedLayerId ?? null,
  activeMasterId: input.activeMasterId ?? null,
  overviewSectionId: input.overviewSectionId ?? null,
  overviewTopGlyphId: input.overviewTopGlyphId ?? null,
  overviewGridState: input.overviewGridState ?? null,
  overviewCustomFilters: normalizeOverviewCustomFilters(
    input.overviewCustomFilters
  ),
})
