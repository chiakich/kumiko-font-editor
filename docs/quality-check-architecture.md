# 品質檢查模組架構

品質檢查 modal（`src/features/common/qualityCheck/`）於 2026-06 重構成清楚分層，三種分析典範各自獨立：

- **母體統計**（結構 + radar，共用取樣）
- **文字排版**（proof，獨立）
- **規則檢查**（lint，獨立）

## 關鍵不變量：worker 的 import graph 不能碰 store

- `resolvedGlyph.ts`：`ResolvedGlyph` / `ResolvedFont` 純型別 + `resolveFontGlyphs`（唯一用 `getGlyphLayer` 的 store adapter，主執行緒）。
- **純層**（可進 worker，皆以 `import type` 取 `ResolvedFont`）：`polygonGeometry`（攤平／面積／矩）、`glyphInk`、`hanClassification`、`structureMetrics`（側邊分類 + 基準）、`glyphSampling`（`buildFontGeometrySamples` ＝ 單次攤平同時產 sides + ink）、`qualityRadar`（`computeRadarFromSamples`）、`populationAnalysis`（`runPopulationAnalysis`）。
- `src/workers/qualityAnalysisWorker.ts` 只 import `runPopulationAnalysis`；build 後該 chunk 約 9KB（**若 store 洩漏會數百 KB，可當回歸檢測**）。
- `useQualityAnalysis.ts`（主執行緒）：`analyzeFontPopulation`（同步便利／測試用）+ `useQualityAnalysis` hook（worker 版，`isAnalyzing` 純衍生自「最後分析的 fontData 是否等於當前」，不在 effect 內同步 `setState`）。

### 為什麼

原本結構分頁對全字體攤平三次（結構分析、radar 內結構、radar 內 ink）且全在主執行緒，大字體會卡。重構後一次攤平 + 丟 worker。

### 怎麼套用

新增母體分析特徵時加在 `glyphSampling` 的 sample 或 `qualityRadar` 的 `collectGlyphFeatures`，不要再各自攤平；任何要進 worker 的程式碼只能 `import type` 自 `resolvedGlyph`，不可 import `resolveFontGlyphs`。proof（`qualityProof.ts`）與 lint（`qualityLint.ts`）維持主執行緒、獨立。

## 2026-06-11 增補：延伸性 + 編輯頁 insight

- **尺寸特徵**（`face:widthRatio` / `heightRatio`）依 3type 延伸性原則先對複雜度（`glyphComplexity` ＝ √inkArea / UPM）做 OLS detrend（斜率 clamp ≥ 0），z-score 比殘差；`RadarAnalysis.sizeTrend` 帶迴歸模型。
- **複雜度分層**（`RadarStrata`：等量 quantile bins，每層 ≥ 30、最多 6 層，層內特徵樣本 < 20 退回全體統計）——否則一／丶這類天生極端的簡單字永遠霸佔風險榜。計分 |z| 封頂 8、可疑門檻 `RADAR_SUSPECT_SCORE = 1`（原 score > 0 會讓近半字體上榜）。`RadarReason` 直接帶同層 median / p10 / p90（已補回 detrend 位移），UI 不需再查 featureStats（該欄位已從 `RadarAnalysis` 移除）。
- `radarAdvice.ts`：`buildRadarAdvice(reason, stat?)` 把 reason 翻成白話（title / detail / action / severity），modal 與 inspector 共用。
- **編輯頁 insight**（`src/features/editor/insight/`）：「凍結的尺量動的筆」——`GlyphInsightProvider`（在 EditorLayout 包三欄）母體基準 debounce 2s 走 worker，單字 sample debounce 150ms 主執行緒重算，`evaluateSampleAgainstRadar` 即時評估。`glyphInsight.ts`（context + hook，因 react-refresh 規則與 Provider 分檔）。消費者：`GlyphInsightCard`（rightPanel Inspect tab）與 `CanvasWorkspace`（`buildStructureGuideModel` → `SceneModel.structureGuide` → `src/canvas/layers/structureGuide.ts` 畫 P10–P90 帶；圖層以 model 欄位存在與否控制顯示，不走 `setLayerVisible`）。
