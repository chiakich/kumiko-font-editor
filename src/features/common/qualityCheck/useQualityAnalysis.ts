import { useEffect, useState } from 'react'
import type { FontData } from 'src/store'
import { resolveFontGlyphs } from 'src/features/common/qualityCheck/resolvedGlyph'
import {
  runPopulationAnalysis,
  type PopulationAnalysis,
} from 'src/features/common/qualityCheck/populationAnalysis'

/**
 * 主執行緒便利函數：同步從 FontData 算出母體分析（小字體、測試、Worker 不可用時的後援）。
 */
export const analyzeFontPopulation = (
  fontData: FontData | null | undefined
): PopulationAnalysis => {
  if (!fontData) {
    return { baseline: null, radar: null }
  }
  return runPopulationAnalysis(resolveFontGlyphs(fontData))
}

interface AnalysisSuccessMessage {
  type: 'analysis-success'
  payload: { requestId: number; analysis: PopulationAnalysis }
}

interface AnalysisErrorMessage {
  type: 'analysis-error'
  payload: { requestId: number; message: string }
}

type WorkerResponse = AnalysisSuccessMessage | AnalysisErrorMessage

let workerInstance: Worker | null = null

const getWorker = () => {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../../workers/qualityAnalysisWorker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  return workerInstance
}

// requestId 必須跨 hook 實例唯一：worker 是單例，多個 hook（編輯頁
// insight + 品質 modal）同時掛 listener 時，各自的計數器會互相接受對方的結果。
let nextRequestId = 0

/**
 * 同一份 fontData 快照只解析、傳輸、計算一次，所有 hook 共用同一個
 * promise，避免重複的主執行緒 resolve + structured clone 卡頓。
 */
const analysisCache = new WeakMap<FontData, Promise<PopulationAnalysis>>()

const requestAnalysis = (fontData: FontData): Promise<PopulationAnalysis> => {
  const cached = analysisCache.get(fontData)
  if (cached) {
    return cached
  }
  const promise = new Promise<PopulationAnalysis>((resolve, reject) => {
    nextRequestId += 1
    const requestId = nextRequestId
    const worker = getWorker()
    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.payload.requestId !== requestId) {
        return
      }
      worker.removeEventListener('message', handleMessage)
      if (event.data.type === 'analysis-success') {
        resolve(event.data.payload.analysis)
      } else {
        analysisCache.delete(fontData)
        reject(new Error(event.data.payload.message))
      }
    }
    worker.addEventListener('message', handleMessage)
    worker.postMessage({
      type: 'analyze',
      payload: { requestId, resolvedFont: resolveFontGlyphs(fontData) },
    })
  })
  analysisCache.set(fontData, promise)
  return promise
}

export interface QualityAnalysisState {
  analysis: PopulationAnalysis | null
  isAnalyzing: boolean
  error: string | null
}

/**
 * 在 Worker 背景執行母體幾何分析。字形解析（脫離 store）在主執行緒做一次，
 * 重計算（攤平 + 統計）丟到 Worker，避免大字體卡住 UI。
 * fontData 變動時自動重算，只採用最後一次請求的結果。
 */
interface WorkerResult {
  /** 此結果對應的 fontData；用來推導「是否仍在分析最新字體」 */
  source: FontData | null
  analysis: PopulationAnalysis | null
  error: string | null
}

export const useQualityAnalysis = (
  fontData: FontData | null | undefined,
  enabled: boolean
): QualityAnalysisState => {
  // 唯一的 setState 在 worker 回應（非同步）；analyzing 狀態純由衍生取得，
  // 不在 effect 內同步 setState，避免 cascading render。
  const [result, setResult] = useState<WorkerResult>({
    source: null,
    analysis: null,
    error: null,
  })

  useEffect(() => {
    if (!enabled || !fontData) {
      return
    }

    // effect 已被新一輪取代（fontData 變動）時丟棄過期結果
    let cancelled = false
    requestAnalysis(fontData).then(
      (analysis) => {
        if (!cancelled) {
          setResult({ source: fontData, analysis, error: null })
        }
      },
      (error: Error) => {
        if (!cancelled) {
          setResult({ source: fontData, analysis: null, error: error.message })
        }
      }
    )

    return () => {
      cancelled = true
    }
  }, [enabled, fontData])

  const ready = enabled && Boolean(fontData)
  if (!ready) {
    return { analysis: null, isAnalyzing: false, error: null }
  }
  // 最後分析的字體不是當前字體 → 仍在背景計算
  const isAnalyzing = result.source !== fontData
  return {
    analysis: result.analysis,
    isAnalyzing,
    error: isAnalyzing ? null : result.error,
  }
}
