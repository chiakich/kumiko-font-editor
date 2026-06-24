import { runPopulationAnalysis } from 'src/lib/qualityCheck/populationAnalysis'
import { getDefaultRadarReferenceData } from 'src/lib/qualityCheck/radarReferenceData'
import { getEnclosureCharacterSet } from 'src/lib/qualityCheck/semanticStructure'
import type { ResolvedFont } from 'src/lib/qualityCheck/resolvedGlyph'
import type { RadarReferenceData } from 'src/lib/qualityCheck/qualityRadar'

/**
 * 母體幾何分析 Worker：接收主執行緒已解析好的純資料字形，
 * 在背景執行緒做攤平 + 統計，避免阻塞 UI。
 * GlyphWiki 語意結構資料由 Worker 自行載入（一次性、有快取），
 * 載入失敗時分析照常進行，只是少了語意分組。
 */
interface AnalyzeMessage {
  type: 'analyze'
  payload: {
    requestId: number
    resolvedFont: ResolvedFont
    referenceData?: RadarReferenceData | null
  }
}

self.onmessage = async (event: MessageEvent<AnalyzeMessage>) => {
  if (event.data.type !== 'analyze') {
    return
  }

  const { requestId, resolvedFont, referenceData } = event.data.payload
  const post = (self as DedicatedWorkerGlobalScope).postMessage.bind(self)

  try {
    const [enclosureChars, resolvedReferenceData] = await Promise.all([
      getEnclosureCharacterSet(),
      referenceData === undefined
        ? getDefaultRadarReferenceData()
        : Promise.resolve(referenceData),
    ])
    const analysis = runPopulationAnalysis(
      resolvedFont,
      enclosureChars,
      resolvedReferenceData
    )
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
