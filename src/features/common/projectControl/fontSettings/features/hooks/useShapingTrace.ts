import { useEffect, useState } from 'react'
import {
  traceTextShaping,
  type HarfBuzzDirection,
  type ShapingTraceStep,
} from 'src/lib/openTypeFeatures'

export interface ShapingTraceInputs {
  buffer: ArrayBuffer
  text: string
  glyphTokens: ReadonlyMap<number, string>
  features: string[]
  direction: HarfBuzzDirection
  script?: string
  language?: string
}

// Runs the (comparatively expensive) HarfBuzz trace only while something wants
// it — the panel enables the hook when a glyph is selected. Results carry the
// inputs they came from, so a stale trace simply is not shown.
export const useShapingTrace = (
  inputs: ShapingTraceInputs | null,
  enabled: boolean
) => {
  const [traced, setTraced] = useState<{
    inputs: ShapingTraceInputs
    steps: ShapingTraceStep[]
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!enabled || !inputs) {
      return
    }
    let cancelled = false
    void traceTextShaping(inputs.buffer, inputs.text, {
      direction: inputs.direction,
      features: inputs.features,
      script: inputs.script,
      language: inputs.language,
    }).then((result) => {
      if (cancelled) {
        return
      }
      setTraced({
        inputs,
        steps: result.ok ? result.steps : [],
        error: result.ok ? null : (result.message ?? null),
      })
    })
    return () => {
      cancelled = true
    }
  }, [inputs, enabled])

  const current =
    traced &&
    inputs &&
    traced.inputs.buffer === inputs.buffer &&
    traced.inputs.text === inputs.text &&
    traced.inputs.direction === inputs.direction &&
    traced.inputs.script === inputs.script &&
    traced.inputs.language === inputs.language &&
    traced.inputs.features.join(',') === inputs.features.join(',')
      ? traced
      : null

  return {
    steps: current?.steps ?? null,
    error: current?.error ?? null,
    isTracing: enabled && Boolean(inputs) && !current,
  }
}
