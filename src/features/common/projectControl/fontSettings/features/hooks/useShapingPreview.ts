import { useEffect, useMemo, useRef, useState } from 'react'
import {
  parseCompilerErrorLocations,
  shapeTextWithHarfBuzz,
  type OpenTypeFeaturesState,
  type ShapeTextResult,
} from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { getShapingPreviewFontBuffer } from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewFont'
import {
  buildDisabledFeatureList,
  buildShapingFeatureList,
  listPreviewFeatureToggles,
  type PreviewDirection,
} from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewModel'
import {
  buildPlaceholderText,
  parsePreviewSegments,
} from 'src/features/common/projectControl/fontSettings/features/utils/shapingPreviewTokens'

export type ShapingPreviewFontStatus =
  | { state: 'idle' }
  | { state: 'compiling' }
  | { state: 'ready' }
  | {
      state: 'error'
      message: string
      // Line-anchored compiler errors, in generated-FEA coordinates.
      errorLocations: ReturnType<typeof parseCompilerErrorLocations>
    }

export interface ShapingPreviewRun {
  glyphs: ShapeTextResult['glyphs']
  unitsPerEm: number
}

// Recompiles are debounced: every keystroke in the feature editor changes the
// state identity, and a CJK font compile is far too heavy to run per key.
const COMPILE_DEBOUNCE_MS = 600

export const useShapingPreview = (input: {
  fontData: FontData | null
  openTypeFeatures: OpenTypeFeaturesState | undefined
}) => {
  const { fontData, openTypeFeatures } = input
  const [text, setText] = useState('')
  const [direction, setDirection] = useState<PreviewDirection>('ltr')
  const [featureOverrides, setFeatureOverrides] = useState<
    Record<string, boolean>
  >({})
  const [fontStatus, setFontStatus] = useState<ShapingPreviewFontStatus>({
    state: 'idle',
  })
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  // Shaping results carry the inputs they were computed from, so a stale
  // result is simply not shown instead of being cleared from inside an effect.
  const [shaped, setShaped] = useState<{
    buffer: ArrayBuffer
    text: string
    featureKey: string
    before: ShapingPreviewRun | null
    after: ShapingPreviewRun | null
    error: string | null
  } | null>(null)
  const requestRef = useRef(0)

  const toggles = useMemo(
    () => listPreviewFeatureToggles(openTypeFeatures, direction),
    [openTypeFeatures, direction]
  )

  const wantsPreview = text.trim().length > 0

  // Compile the preview font. Idle until the user actually types something:
  // the compile is the expensive half and most visits never use the preview.
  useEffect(() => {
    if (!wantsPreview || !fontData) {
      return
    }
    const requestId = (requestRef.current += 1)
    const timer = setTimeout(() => {
      setFontStatus({ state: 'compiling' })
      getShapingPreviewFontBuffer(fontData, openTypeFeatures)
        .then((compiled) => {
          if (requestRef.current !== requestId) {
            return
          }
          setBuffer(compiled)
          setFontStatus({ state: 'ready' })
        })
        .catch((error: unknown) => {
          if (requestRef.current !== requestId) {
            return
          }
          const rawOutput =
            error && typeof error === 'object' && 'rawCompilerOutput' in error
              ? String(
                  (error as { rawCompilerOutput?: unknown })
                    .rawCompilerOutput ?? ''
                )
              : ''
          setBuffer(null)
          setFontStatus({
            state: 'error',
            message:
              error instanceof Error ? error.message : String(error ?? ''),
            errorLocations: rawOutput
              ? parseCompilerErrorLocations(rawOutput)
              : [],
          })
        })
    }, COMPILE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [fontData, openTypeFeatures, wantsPreview])

  const featureList = useMemo(
    () => buildShapingFeatureList(toggles, featureOverrides),
    [toggles, featureOverrides]
  )
  const disabledList = useMemo(
    () => buildDisabledFeatureList(toggles),
    [toggles]
  )

  const featureKey = `${direction}|${disabledList.join(',')}|${featureList.join(',')}`
  // `/glyphName` tokens: shaped as placeholders, swapped for the named glyph.
  const placeholder = useMemo(
    () => buildPlaceholderText(parsePreviewSegments(text)),
    [text]
  )

  // Shape both runs. Shaping is cheap next to compiling, so no debounce here —
  // the preview follows the text field keystroke by keystroke.
  useEffect(() => {
    if (!buffer || !text) {
      return
    }
    let cancelled = false
    const shapeRun = (features: string[]) =>
      shapeTextWithHarfBuzz(buffer, placeholder.text, {
        direction,
        features,
        includeGlyphShapes: true,
        glyphTokens: placeholder.tokensByCluster,
      })
    void Promise.all([shapeRun(disabledList), shapeRun(featureList)]).then(
      ([beforeResult, afterResult]) => {
        if (cancelled) {
          return
        }
        if (!beforeResult.ok || !afterResult.ok) {
          setShaped({
            buffer,
            text,
            featureKey,
            before: null,
            after: null,
            error:
              (!beforeResult.ok ? beforeResult.message : null) ??
              (!afterResult.ok ? afterResult.message : null) ??
              null,
          })
          return
        }
        const unitsPerEm =
          afterResult.unitsPerEm ?? beforeResult.unitsPerEm ?? 1000
        setShaped({
          buffer,
          text,
          featureKey,
          before: { glyphs: beforeResult.glyphs, unitsPerEm },
          after: { glyphs: afterResult.glyphs, unitsPerEm },
          error: null,
        })
      }
    )
    return () => {
      cancelled = true
    }
  }, [
    buffer,
    text,
    featureKey,
    featureList,
    disabledList,
    direction,
    placeholder,
  ])

  // A result only counts while its inputs are still the current ones.
  const current =
    shaped && shaped.buffer === buffer && shaped.text === text ? shaped : null
  const before = current?.before ?? null
  const after =
    current && current.featureKey === featureKey ? current.after : null
  const shapeError = current?.error ?? null
  // Names asked for with /token syntax that the compiled font does not have.
  const unknownGlyphTokens = useMemo(() => {
    const names = new Set<string>()
    for (const glyph of after?.glyphs ?? []) {
      if (glyph.unknownGlyphToken) {
        names.add(glyph.unknownGlyphToken)
      }
    }
    return [...names]
  }, [after])

  const toggleFeature = (tag: string) => {
    const toggle = toggles.find((entry) => entry.tag === tag)
    if (!toggle) {
      return
    }
    setFeatureOverrides((current) => {
      const enabled = current[tag] ?? toggle.defaultOn
      const next = { ...current }
      if (!enabled === toggle.defaultOn) {
        delete next[tag]
      } else {
        next[tag] = !enabled
      }
      return next
    })
  }

  return {
    text,
    setText,
    direction,
    setDirection,
    toggles,
    featureOverrides,
    toggleFeature,
    isFeatureEnabled: (tag: string) =>
      featureOverrides[tag] ??
      toggles.find((entry) => entry.tag === tag)?.defaultOn ??
      false,
    fontStatus,
    before,
    after,
    shapeError,
    unknownGlyphTokens,
    // Everything a trace run needs to reproduce the after-run exactly.
    traceInputs:
      buffer && wantsPreview
        ? {
            buffer,
            text: placeholder.text,
            glyphTokens: placeholder.tokensByCluster,
            features: featureList,
            direction,
          }
        : null,
  }
}
