import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'src/store'
import {
  getStructureBodyBox,
  isHanGlyph,
} from 'src/features/common/qualityCheck/hanClassification'
import { buildGlyphGeometrySample } from 'src/features/common/qualityCheck/glyphSampling'
import { evaluateSampleAgainstRadar } from 'src/features/common/qualityCheck/qualityRadar'
import { resolveFontGlyphs } from 'src/features/common/qualityCheck/resolvedGlyph'
import { useQualityAnalysis } from 'src/features/common/qualityCheck/useQualityAnalysis'
import {
  GlyphInsightContext,
  idleGlyphInsight,
  type GlyphInsightValue,
} from 'src/features/editor/insight/glyphInsight'

const POPULATION_REFRESH_MS = 2000
const LIVE_SAMPLE_MS = 150

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function GlyphInsightProvider({ children }: { children: ReactNode }) {
  const fontData = useStore((state) => state.fontData)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const editorGlyphIds = useStore((state) => state.editorGlyphIds)
  const editorActiveGlyphIndex = useStore(
    (state) => state.editorActiveGlyphIndex
  )
  const activeGlyphId =
    editorGlyphIds[editorActiveGlyphIndex] ?? selectedGlyphId ?? null

  const [showBands, setShowBands] = useState(false)

  // 母體基準刻意落後編輯 2 秒：尺不該跟著正在改的筆跳動
  const baselineFontData = useDebouncedValue(fontData, POPULATION_REFRESH_MS)
  const { analysis, isAnalyzing } = useQualityAnalysis(baselineFontData, true)

  const liveFontData = useDebouncedValue(fontData, LIVE_SAMPLE_MS)
  const sample = useMemo(() => {
    if (!liveFontData || !activeGlyphId) {
      return null
    }
    const glyph = liveFontData.glyphs[activeGlyphId]
    if (!glyph || !isHanGlyph(glyph)) {
      return null
    }
    const resolvedFont = resolveFontGlyphs(liveFontData)
    return buildGlyphGeometrySample(
      resolvedFont.glyphs[activeGlyphId],
      resolvedFont.glyphs,
      resolvedFont.bodyBox
    )
  }, [activeGlyphId, liveFontData])

  const radar = analysis?.radar ?? null
  const evaluation = useMemo(() => {
    if (!sample || !radar || !liveFontData) {
      return null
    }
    return evaluateSampleAgainstRadar(
      sample,
      radar,
      getStructureBodyBox(liveFontData)
    )
  }, [liveFontData, radar, sample])

  const value = useMemo<GlyphInsightValue>(() => {
    if (!sample) {
      return { ...idleGlyphInsight, showBands, setShowBands }
    }
    return {
      status: radar ? 'ready' : isAnalyzing ? 'analyzing' : 'insufficient',
      sample,
      evaluation,
      baseline: analysis?.baseline ?? null,
      showBands,
      setShowBands,
    }
  }, [analysis, evaluation, isAnalyzing, radar, sample, showBands])

  return (
    <GlyphInsightContext.Provider value={value}>
      {children}
    </GlyphInsightContext.Provider>
  )
}
