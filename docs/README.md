# 開發者筆記

記錄專案的設計決策、架構與容易踩的坑——程式碼或 git history 看不出「為什麼這樣做」的部分。

- [產品定位與開發路線](product-direction.md) — Kumiko 是協作補字平台而非通用編輯器，已議定的同步／kerning／IDS 路線
- [CJK 組字策略與資料管線](cjk-component-strategy.md) — 為何複製輪廓而非 component 引用，BabelStone／GlyphWiki 管線與座標約定
- [品質檢查模組架構](quality-check-architecture.md) — qualityCheck 分層、ResolvedGlyph 解耦、worker 邊界、編輯頁 insight
- [Glyph 命名與名稱對應](glyph-naming.md) — Glyphs nice name vs production name、GlyphData.xml 管線、為何 AGL 不夠用
