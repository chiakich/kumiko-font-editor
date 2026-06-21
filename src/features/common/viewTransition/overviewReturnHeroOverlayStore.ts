import type { OverviewReturnHeroRect } from 'src/features/common/viewTransition/overviewReturnHeroGeometry'

export interface OverviewReturnHeroState {
  glyphId: string
  id: number
  sourceRect: OverviewReturnHeroRect
}

const listeners = new Set<() => void>()
let currentState: OverviewReturnHeroState | null = null
let nextOverlayId = 1

const emitChange = () => {
  for (const listener of listeners) {
    listener()
  }
}

export function getOverviewReturnHeroState(): OverviewReturnHeroState | null {
  return currentState
}

export function subscribeOverviewReturnHero(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function startOverviewReturnHeroOverlay(
  glyphId: string,
  sourceRect: OverviewReturnHeroRect
): void {
  currentState = {
    glyphId,
    id: nextOverlayId,
    sourceRect,
  }
  nextOverlayId += 1
  emitChange()
}

export function clearOverviewReturnHeroOverlay(id: number): void {
  if (currentState?.id !== id) {
    return
  }
  currentState = null
  emitChange()
}
