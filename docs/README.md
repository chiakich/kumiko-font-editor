# 開發者筆記

記錄專案的設計決策、架構與容易踩的坑——程式碼或 git history 看不出「為什麼這樣做」的部分。

- [架構總覽](architecture.md)（英文）— 技術選型、狀態管理策略與專案結構；這裡的深入筆記都從這份總覽導航
- [產品定位與開發路線](product-direction.md) — Kumiko 是協作補字平台而非通用編輯器，已議定的同步／kerning／IDS 路線
- [CJK 組字策略與資料管線](cjk-component-strategy.md) — 為何複製輪廓而非 component 引用，BabelStone／GlyphWiki 管線與座標約定
- [品質檢查模組架構](quality-check-architecture.md) — qualityCheck 分層、ResolvedGlyph 解耦、worker 邊界、編輯頁 insight
- [Glyph 命名與名稱對應](glyph-naming.md) — Glyphs nice name vs production name、GlyphData.xml 管線、為何 AGL 不夠用
- [與 fontra 的相容與跟進策略](fontra-parity.md) — UFO 互通、演算法層移植、baseline SHA 與 re-sync 流程
- [Variable Font 支援：設計與實作計畫](variable-fonts.md) — 插值資料流、現況盤點、分階段計畫與 fontra 對應檔案
- [OpenType feature 工作流](opentype-feature-workflow.md) — `.fea`、反組譯 GDEF/GPOS/GSUB、`openTypeFeatures` 單一資料模型與後續 UI/解析路線
- [OpenType feature：現況盤點與目標架構](opentype-feature-roadmap.md) — 2026-07 全面盤點、缺口清單、feature workspace 目標架構與施工順序
- [Kerning Roadmap](kerning.md) — UFO kerning/group model、開源 UI 參考與 Kumiko 導入順序
- [Kumiko project persistence](kumiko-project-persistence.md) — 格式無關的 project/glyph IndexedDB records 與不重複保存向量資料的規則
