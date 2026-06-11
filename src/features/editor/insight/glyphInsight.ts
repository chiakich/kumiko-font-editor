import { createContext, useContext } from 'react'
import type { GlyphGeometrySample } from 'src/features/common/qualityCheck/glyphSampling'
import type { RadarGlyphEvaluation } from 'src/features/common/qualityCheck/qualityRadar'
import type { StructureBaseline } from 'src/features/common/qualityCheck/structureMetrics'

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
  showBands: boolean
  setShowBands: (visible: boolean) => void
}

export const idleGlyphInsight: GlyphInsightValue = {
  status: 'idle',
  sample: null,
  evaluation: null,
  baseline: null,
  showBands: false,
  setShowBands: () => {},
}

export const GlyphInsightContext =
  createContext<GlyphInsightValue>(idleGlyphInsight)

export const useGlyphInsight = () => useContext(GlyphInsightContext)
