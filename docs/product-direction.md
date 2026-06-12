# 產品定位與開發路線

Kumiko 先專注在「字體的協作補字平台」的開發方向。

優先序是「貢獻者工作流 > 編輯器完整度」。評估新功能時，以「補字貢獻者的一日工作流」為準。

## 已議定路線（2026-06）

1. **GitHub 同步狀態機**（已完成，commit `a4977c5`）：`remoteBlobSha`（git blob SHA）為 GitHub 基準線，與本地匯出用的 FNV `sourceHash` 分離；`lastSync` 記 tracking branch；衝突 per-glyph 解（keepLocal / takeRemote），pull 用 archive zip 一次下載。
2. **待補字清單**（已完成，`be5cb02`）、**IDS component 插入最小版**（已完成，`dd560be`）。
3. **Kerning**：之後要錨定 UFO 模型（`groups.plist` / `kerning.plist`），匯出時生 FEA 餵現有 Pyodide fontTools pipeline——不做 GPOS lookup 編輯 UI。
   - 注意：現有 spacing class 存在 `openTypeFeatures` GPOS IR，與 UFO plist 兩邊未接通；`FontData.kerningPairs / kerningGroups` 已宣告但未使用。**kerning 工作開始時先重構 spacing class 資料底層。**
4. **GDEF / GPOS / GSUB 編輯 UI** 無限期擱置，維持「保留不破壞」。
