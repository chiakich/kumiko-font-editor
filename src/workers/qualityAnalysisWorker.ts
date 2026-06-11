import { runPopulationAnalysis } from 'src/features/common/qualityCheck/populationAnalysis'
import type { ResolvedFont } from 'src/features/common/qualityCheck/resolvedGlyph'

/**
 * 母體幾何分析 Worker：接收主執行緒已解析好的純資料字形，
 * 在背景執行緒做攤平 + 統計，避免阻塞 UI。
 */
interface AnalyzeMessage {
  type: 'analyze'
  payload: {
    requestId: number
    resolvedFont: ResolvedFont
  }
}

self.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  if (event.data.type !== 'analyze') {
    return
  }

  const { requestId, resolvedFont } = event.data.payload
  const post = (self as DedicatedWorkerGlobalScope).postMessage.bind(self)

  try {
    const analysis = runPopulationAnalysis(resolvedFont)
    post({ type: 'analysis-success', payload: { requestId, analysis } })
  } catch (error) {
    post({
      type: 'analysis-error',
      payload: {
        requestId,
        message: error instanceof Error ? error.message : '幾何分析失敗',
      },
    })
  }
}
