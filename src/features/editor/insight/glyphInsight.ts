import { createContext, useContext } from 'react'
import type { GlyphGeometrySample } from 'src/lib/qualityCheck/glyphSampling'
import type { RadarGlyphEvaluation } from 'src/lib/qualityCheck/qualityRadar'
import type { StructureBaseline } from 'src/lib/qualityCheck/structureMetrics'
import type { StructureRuler } from 'src/lib/qualityCheck/structureRuler'

/**
 * 編輯頁的單字品質洞察：母體基準（Worker、節流重算）是凍結的尺，
 * 正在編輯的字（主執行緒、近即時取樣）是動的筆。Inspector 卡片與
 * 畫布分布帶圖層共用同一份結果，避免重複分析與不同步。
 */

export type GlyphInsightStatus = 'idle' | 'analyzing' | 'insufficient' | 'ready'

export interface GlyphInsightValue {
  status: GlyphInsightStatus
  sample: GlyphGeometrySample | null
  evaluation: RadarGlyphEvaluation | null
  baseline: StructureBaseline | null
  ruler: StructureRuler | null
  showBands: boolean
  setShowBands: (visible: boolean) => void
}

export const idleGlyphInsight: GlyphInsightValue = {
  status: 'idle',
  sample: null,
  evaluation: null,
  baseline: null,
  ruler: null,
  showBands: true,
  setShowBands: () => {},
}

export const GlyphInsightContext =
  createContext<GlyphInsightValue>(idleGlyphInsight)

export const useGlyphInsight = () => useContext(GlyphInsightContext)
