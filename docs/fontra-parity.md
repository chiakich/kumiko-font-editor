# 與 fontra 的相容與跟進策略

Kumiko 的字體編輯設計參考了 [fontra](https://github.com/googlefonts/fontra)。兩者技術棧差異顯著——Kumiko 為純前端架構（React + Vite + Zustand），fontra 為前後端分離架構（Web Components + Webpack 前端、Python WebSocket 後端）——因此無法以 fork 或 merge 的方式直接共用程式碼。

本文件說明 Kumiko 採用的相容方式，以及在 fontra 發布新版本時跟進的流程。相容性依耦合程度分為三個層級。

## 一、檔案層互通（UFO / designspace）

fontra 以 UFO 與 `.designspace` 為主要儲存格式，Kumiko 亦支援 UFO 的讀寫，因此 outline、component、anchor、metrics、kerning 等標準欄位可在兩者間交換，無需任何程式碼層的關聯。

為確保 round-trip 不遺失資料，Kumiko 在讀取 UFO 時保留 fontra 寫入的非標準 `lib` key（例如 `fontra.sourceStatusFieldDefinitions`），並於寫出時原樣帶回，即使這些欄位 Kumiko 本身並未使用。相關邏輯位於 `src/lib/fontFormats/`。

fontra 的原生 `.fontra` 格式目前不支援。是否實作取決於目標使用者是否需要交換原生 `.fontra` 專案；在確認需求前不納入範圍。

## 二、演算法層移植

與 UI 框架無關的數學模組以逐檔方式移植至 `src/font/fontra-ported/`，檔名與 fontra 對應，並於檔首標註 `// ported from fontra <sha>`。詳細規範見該目錄的 [README](../src/font/fontra-ported/README.md)。

移植範圍限於 fontra 較完整、而 Kumiko 尚未具備、且與框架無關的部分。Kumiko 已自行實作且成熟的功能（節點連動、boolean 運算、視覺化圖層）不在移植範圍內，以避免與既有實作衝突。

幾何運算方面，凡 fontra 倚賴 `bezier-js` 之處，Kumiko 亦直接採用同一套函式庫，而非自行以取樣近似：

- hit-test 的曲線最近點改用 `Bezier.project()`（`SceneController.nearestPointOnSegment`）。
- 切刀的線↔曲線交點改用 `Bezier.lineIntersects()`（`KnifeTool.findSegmentIntersection`），取代將曲線取樣為折線後逐段求交。

## 三、UI 與後端：追蹤但不跟進

編輯器 UI（Web Components）、WebSocket 通訊協定、Python 後端與 workflow engine 不嘗試同步；所需功能由 Kumiko 自行實作。fontra 的動向以其 `CHANGELOG.md` 為追蹤來源。

視覺化圖層為一個例外管道。Kumiko 的 `VisualizationLayerDefinition`（`selectionFunc`、`draw`、`screenParameters`、`colors` / `colorsDarkMode`）與 fontra 的 `visualization-layer-definitions.js` 結構相近，fontra 新增的圖層可移植其 `draw` 函式，並改用 Kumiko 的繪圖 context。

## Baseline 版本

目前對齊的 fontra 版本：

| 項目   | 值                                         |
| ------ | ------------------------------------------ |
| commit | `eae93be5792e9cf3c1b8fbbc6218708f8f5974a6` |
| tag    | `2026.6.2`                                 |
| date   | 2026-06-11                                 |

更新 baseline 時，須同步更新本表與已移植檔案檔首的 SHA 註解。

## 已移植模組對應表

| fontra 來源                                   | Kumiko 檔案                                          | 備註                                        |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `fontra-core/src/fit-cubic.js`                | `src/font/fontra-ported/fit-cubic.ts`                | 曲線擬合 + Newton-Raphson；依賴 `bezier-js` |
| `fontra-core/src/var-model.js`                | `src/font/fontra-ported/var-model.ts`                | VariationModel；省略未使用的 `sorted()`     |
| `fontra-core/src/discrete-variation-model.js` | `src/font/fontra-ported/discrete-variation-model.ts` | 省略未使用的 `getAllDiscreteLocations()`    |
| `fontra-core/src/var-funcs.js`                | `src/font/fontra-ported/var-funcs.ts`                | 相依                                        |
| `fontra-core/src/vector.js`                   | `src/font/fontra-ported/vector.ts`                   | 相依（全檔）                                |
| `fontra-core/src/set-ops.js`                  | `src/font/fontra-ported/set-ops.ts`                  | 相依（僅 `isSuperset`）                     |
| `fontra-core/src/errors.js`                   | `src/font/fontra-ported/errors.ts`                   | 相依（僅 `VariationError`）                 |
| `fontra-core/src/utils.ts`                    | `src/font/fontra-ported/utils.ts`                    | 相依（僅 iteration / math 子集）            |

## Re-sync 流程

fontra 發布新版本時，依下列步驟更新已移植的模組：

1. 於 fontra repo 執行 `git diff <baseline-sha> <new-sha> -- src-js/fontra-core/src/<file>.js`，逐檔檢視差異。
2. 將差異套用至對應的 `.ts` 檔，並維持 prettier 風格與本文件記錄的省略項。
3. 執行 `pnpm vitest run src/font/fontra-ported`，確認數值回歸測試通過。
4. 更新本文件的 baseline 表與各檔檔首的 SHA 註解。

## 資料模型演進的追蹤

fontra 的 `src-js/fontra-core/src/classes.json` 由其 Python `classes.py` 自動產生，為資料模型的 schema。比對此檔在新舊 SHA 間的差異，可快速判斷 variable font、kerning、axis 等資料模型是否新增欄位，作為評估跟進範圍的依據。
