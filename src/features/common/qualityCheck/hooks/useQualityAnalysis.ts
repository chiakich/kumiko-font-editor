import { useEffect, useState } from 'react'
import { useStore, getGlyphLayer, type FontData } from 'src/store'
import {
  resolveFontGlyphs,
  resolveGlyph,
  type ResolvedFont,
  type ResolvedGlyph,
} from 'src/lib/qualityCheck/resolvedGlyph'
import type { PopulationAnalysis } from 'src/lib/qualityCheck/populationAnalysis'
import type { RadarReferenceData } from 'src/lib/qualityCheck/qualityRadar'
import { loadProjectGlyphGeometryClosure } from 'src/lib/project/projectRepository'

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
      new URL('../../../../workers/qualityAnalysisWorker.ts', import.meta.url),
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
const analysisCache = new WeakMap<
  FontData,
  Map<RadarReferenceData | null | undefined, Promise<PopulationAnalysis>>
>()

/**
 * 字形幾何是 lazy-load 的：總覽頁瀏覽到才進 store，還有 LRU 驅逐。
 * 品質分析不能只拿「剛好已載入」的字，否則一開 modal 就是「漢字不足」。
 * 這裡直接從 IndexedDB 補齊缺幾何的字形，解析成 ResolvedGlyph 後
 * 以模組快取保存（不進 store、不受驅逐影響）；已編輯的字以 store
 * 版本為準，快取用 glyphEditTimes 判斷是否失效。
 */
let resolvedCacheProjectId: string | null = null
const resolvedGlyphCache = new Map<
  string,
  { resolved: ResolvedGlyph; editTime: number | undefined }
>()

const resolveFontGlyphsComplete = async (
  fontData: FontData
): Promise<ResolvedFont> => {
  const resolved = resolveFontGlyphs(fontData)
  const { projectId, glyphEditTimes } = useStore.getState()
  if (!projectId) {
    return resolved
  }
  if (resolvedCacheProjectId !== projectId) {
    resolvedGlyphCache.clear()
    resolvedCacheProjectId = projectId
  }

  const missingGlyphIds: string[] = []
  for (const glyph of Object.values(fontData.glyphs)) {
    if (resolved.glyphs[glyph.id]) {
      continue
    }
    const cached = resolvedGlyphCache.get(glyph.id)
    if (cached && cached.editTime === glyphEditTimes[glyph.id]) {
      resolved.glyphs[glyph.id] = cached.resolved
    } else {
      missingGlyphIds.push(glyph.id)
    }
  }
  if (missingGlyphIds.length === 0) {
    return resolved
  }

  const loadedGlyphs = await loadProjectGlyphGeometryClosure(
    projectId,
    missingGlyphIds,
    { loadedGlyphIds: Object.keys(resolved.glyphs) }
  )
  for (const glyphData of loadedGlyphs) {
    if (!glyphData || !getGlyphLayer(glyphData, glyphData.activeLayerId)) {
      continue
    }
    const resolvedGlyph = resolveGlyph(glyphData)
    resolved.glyphs[resolvedGlyph.id] = resolvedGlyph
    resolvedGlyphCache.set(resolvedGlyph.id, {
      resolved: resolvedGlyph,
      editTime: glyphEditTimes[resolvedGlyph.id],
    })
  }
  return resolved
}

const requestAnalysis = (
  fontData: FontData,
  referenceData?: RadarReferenceData | null
): Promise<PopulationAnalysis> => {
  let cacheByReferenceData = analysisCache.get(fontData)
  if (!cacheByReferenceData) {
    cacheByReferenceData = new Map()
    analysisCache.set(fontData, cacheByReferenceData)
  }
  const cached = cacheByReferenceData.get(referenceData)
  if (cached) {
    return cached
  }
  const promise = resolveFontGlyphsComplete(fontData).then(
    (resolvedFont) =>
      new Promise<PopulationAnalysis>((resolve, reject) => {
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
            cacheByReferenceData.delete(referenceData)
            reject(new Error(event.data.payload.message))
          }
        }
        worker.addEventListener('message', handleMessage)
        worker.postMessage({
          type: 'analyze',
          payload: { requestId, resolvedFont, referenceData },
        })
      })
  )
  promise.catch(() => {
    cacheByReferenceData.delete(referenceData)
  })
  cacheByReferenceData.set(referenceData, promise)
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
  enabled: boolean,
  referenceData?: RadarReferenceData | null
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
    requestAnalysis(fontData, referenceData).then(
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
  }, [enabled, fontData, referenceData])

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
