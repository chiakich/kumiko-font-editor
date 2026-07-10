import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'src/store'
import {
  getGlyphCharacter,
  getStructureBodyBox,
  isHanGlyph,
} from 'src/lib/qualityCheck/hanClassification'
import {
  buildGlyphGeometrySample,
  type GlyphGeometrySample,
} from 'src/lib/qualityCheck/glyphSampling'
import { evaluateSampleAgainstRadar } from 'src/lib/qualityCheck/qualityRadar'
import { resolveFontGlyphs } from 'src/lib/qualityCheck/resolvedGlyph'
import { useQualityAnalysis } from 'src/features/common/qualityCheck/hooks/useQualityAnalysis'
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
  const referenceData = useStore((state) =>
    state.referenceFontResidualEnabled &&
    state.referenceFontResidualStatus === 'ready'
      ? (state.referenceFontResidualData ?? undefined)
      : undefined
  )
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const editorGlyphIds = useStore((state) => state.editorGlyphIds)
  const editorActiveGlyphIndex = useStore(
    (state) => state.editorActiveGlyphIndex
  )
  const activeGlyphId =
    editorGlyphIds[editorActiveGlyphIndex] ?? selectedGlyphId ?? null

  const [showBands, setShowBands] = useState(true)

  // 母體基準刻意落後編輯 2 秒：尺不該跟著正在改的筆跳動
  const baselineFontData = useDebouncedValue(fontData, POPULATION_REFRESH_MS)
  const { analysis, isAnalyzing } = useQualityAnalysis(
    baselineFontData,
    true,
    referenceData
  )
  const radar = analysis?.radar ?? null

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
    const resolvedGlyph = resolvedFont.glyphs[activeGlyphId]
    if (!resolvedGlyph) {
      return null
    }
    return buildGlyphGeometrySample(
      resolvedGlyph,
      resolvedFont.glyphs,
      resolvedFont.bodyBox,
      radar?.partLayoutsByCharacter.get(getGlyphCharacter(resolvedGlyph))
    )
  }, [activeGlyphId, liveFontData, radar])

  const baselineCandidate = sample
    ? radar?.partSpacingBaselineByGlyphId.get(sample.glyphId)
    : undefined
  const [frozenPartSpacing, setFrozenPartSpacing] = useState<{
    glyphId: string
    value: NonNullable<GlyphGeometrySample['partSpacing']>
  } | null>(null)
  // React 支援在 render 中以「前一個 prop 身分」條件式調整 state；同一字後續的
  // radar refresh 不覆寫快照，切換字時才建立新的編輯前基準。
  if (
    sample &&
    baselineCandidate &&
    frozenPartSpacing?.glyphId !== sample.glyphId
  ) {
    setFrozenPartSpacing({
      glyphId: sample.glyphId,
      value: baselineCandidate,
    })
  }

  const evaluation = useMemo(() => {
    if (!sample || !radar || !liveFontData) {
      return null
    }
    return evaluateSampleAgainstRadar(
      sample,
      radar,
      getStructureBodyBox(liveFontData),
      frozenPartSpacing?.glyphId === sample.glyphId
        ? frozenPartSpacing.value
        : baselineCandidate
    )
  }, [baselineCandidate, frozenPartSpacing, liveFontData, radar, sample])

  const value = useMemo<GlyphInsightValue>(() => {
    if (!sample) {
      return { ...idleGlyphInsight, showBands, setShowBands }
    }
    const ruler = analysis?.ruler ?? null
    return {
      status: radar ? 'ready' : isAnalyzing ? 'analyzing' : 'insufficient',
      sample,
      evaluation,
      baseline: ruler?.baseline ?? analysis?.baseline ?? null,
      ruler,
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
