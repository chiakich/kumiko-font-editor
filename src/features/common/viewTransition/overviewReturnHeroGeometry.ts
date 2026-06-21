export interface OverviewReturnHeroRect {
  height: number
  width: number
  x: number
  y: number
}

export function normalizeOverviewReturnHeroRect(
  rect: OverviewReturnHeroRect
): OverviewReturnHeroRect {
  const fallbackSize = 112
  return {
    height: Math.max(1, rect.height || fallbackSize),
    width: Math.max(1, rect.width || fallbackSize),
    x: Number.isFinite(rect.x)
      ? rect.x
      : (window.innerWidth - fallbackSize) / 2,
    y: Number.isFinite(rect.y)
      ? rect.y
      : (window.innerHeight - fallbackSize) / 2,
  }
}

export function getEditorGlyphHeroSourceRect(): OverviewReturnHeroRect {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-editor-canvas="true"]'
  )
  const bounds =
    canvas?.parentElement?.getBoundingClientRect() ??
    canvas?.getBoundingClientRect()

  if (!bounds) {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.74
    return {
      height: size,
      width: size,
      x: (window.innerWidth - size) / 2,
      y: (window.innerHeight - size) / 2,
    }
  }

  const size = Math.max(112, Math.min(bounds.width, bounds.height) * 0.82)
  return {
    height: size,
    width: size,
    x: bounds.left + (bounds.width - size) / 2,
    y: bounds.top + (bounds.height - size) / 2,
  }
}

export function getOverviewReturnHeroFallbackTargetRect(): OverviewReturnHeroRect {
  const size = Math.min(
    112,
    window.innerWidth * 0.32,
    window.innerHeight * 0.32
  )
  return {
    height: size,
    width: size,
    x: (window.innerWidth - size) / 2,
    y: (window.innerHeight - size) / 2,
  }
}

function isPaintableRect(rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false
  }
  return (
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight
  )
}

export function findOverviewGlyphTargetRect(
  glyphId: string
): OverviewReturnHeroRect | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    '[data-overview-glyph-preview-id]'
  )
  for (const candidate of candidates) {
    if (candidate.dataset.overviewGlyphPreviewId !== glyphId) {
      continue
    }
    const rect = candidate.getBoundingClientRect()
    if (!isPaintableRect(rect)) {
      return null
    }
    return {
      height: rect.height,
      width: rect.width,
      x: rect.left,
      y: rect.top,
    }
  }
  return null
}
