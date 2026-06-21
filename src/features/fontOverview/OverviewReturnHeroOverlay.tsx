import { Box } from '@chakra-ui/react'
import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { GlyphPreview } from 'src/features/fontOverview/components/GlyphCard'
import {
  findOverviewGlyphTargetRect,
  getOverviewReturnHeroFallbackTargetRect,
  normalizeOverviewReturnHeroRect,
} from 'src/features/fontOverview/overviewReturnHeroGeometry'
import {
  clearOverviewReturnHeroOverlay,
  getOverviewReturnHeroState,
  subscribeOverviewReturnHero,
} from 'src/features/fontOverview/overviewReturnHeroOverlayStore'
import { useStore } from 'src/store'

const RETURN_HERO_DURATION_MS = 300

export function OverviewReturnHeroOverlay() {
  const overlay = useSyncExternalStore(
    subscribeOverviewReturnHero,
    getOverviewReturnHeroState,
    getOverviewReturnHeroState
  )
  const fontData = useStore((state) => state.fontData)
  const glyphMap = useMemo(() => fontData?.glyphs ?? {}, [fontData?.glyphs])
  const glyph = overlay ? (glyphMap[overlay.glyphId] ?? null) : null
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!overlay || !glyph) {
      return
    }

    const element = overlayRef.current
    if (!element) {
      return
    }

    let cancelled = false
    let opacityAnimation: Animation | null = null
    let transformAnimation: Animation | null = null
    let frameId: number | null = null
    let secondFrameId: number | null = null
    const sourceRect = normalizeOverviewReturnHeroRect(overlay.sourceRect)
    const fieldInkColor =
      window
        .getComputedStyle(element)
        .getPropertyValue('--chakra-colors-field-ink')
        .trim() || '#080b0d'

    element.style.width = `${sourceRect.width}px`
    element.style.height = `${sourceRect.height}px`
    element.style.transformOrigin = 'top left'
    element.style.transform = `translate3d(${sourceRect.x}px, ${sourceRect.y}px, 0) scale(1)`
    element.style.color = 'white'
    element.style.opacity = '0'

    frameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        if (cancelled) {
          return
        }

        const realTargetRect = findOverviewGlyphTargetRect(overlay.glyphId)
        const targetRect =
          realTargetRect ?? getOverviewReturnHeroFallbackTargetRect()
        const targetScaleX = targetRect.width / sourceRect.width
        const targetScaleY = targetRect.height / sourceRect.height

        const sourceTransform = `translate3d(${sourceRect.x}px, ${sourceRect.y}px, 0) scale(1)`
        const targetTransform = `translate3d(${targetRect.x}px, ${targetRect.y}px, 0) scale(${targetScaleX}, ${targetScaleY})`

        transformAnimation = element.animate(
          [
            {
              transform: sourceTransform,
            },
            {
              transform: targetTransform,
            },
          ],
          {
            duration: RETURN_HERO_DURATION_MS,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            fill: 'forwards',
          }
        )
        opacityAnimation = element.animate(
          [
            { color: '#aaa', opacity: 0, offset: 0 },
            { color: '#aaa', opacity: 0.4, offset: 0.16 },
            {
              color: fieldInkColor,
              opacity: 0,
              offset: 0.4,
            },
            {
              color: fieldInkColor,
              opacity: 0,
              offset: 1,
            },
          ],
          {
            duration: RETURN_HERO_DURATION_MS,
            easing: 'ease-in-out',
            fill: 'forwards',
          }
        )

        void Promise.all([
          transformAnimation.finished,
          opacityAnimation.finished,
        ])
          .catch(() => undefined)
          .then(() => {
            if (cancelled) {
              return
            }
            clearOverviewReturnHeroOverlay(overlay.id)
          })
      })
    })

    return () => {
      cancelled = true
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId)
      }
      opacityAnimation?.cancel()
      transformAnimation?.cancel()
    }
  }, [glyph, overlay])

  if (!overlay || !glyph) {
    return null
  }

  return createPortal(
    <Box
      ref={overlayRef}
      position="fixed"
      top={0}
      left={0}
      zIndex={2147483647}
      color="field.ink"
      pointerEvents="none"
      aria-hidden="true"
      sx={{
        contain: 'layout paint style',
        willChange: 'color, transform, opacity',
      }}
    >
      <GlyphPreview glyph={glyph} glyphMap={glyphMap} inheritFallbackColor />
    </Box>,
    document.body
  )
}
