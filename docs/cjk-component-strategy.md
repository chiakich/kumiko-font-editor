# CJK 組字策略與資料管線

## 核心決策（2026-06）

漢字組字插入部件用「**複製輪廓 + 自動對位**」，**不用 component 引用**。引用保留給拉丁 diacritics；`addComponentRef` action 留在 store 但 CJK UI 不用。

### 為什麼

1. 漢字偏旁在不同字裡有微妙差異，引用會強迫共用形狀。
2. component 引用打破 per-glyph 檔案隔離，會讓 GitHub per-glyph 同步與 PR review 失準（改一個部件默默影響所有引用字）。
3. 工具鏈對巢狀引用支援不一。

## 資料管線

兩支 script 皆可重跑更新（見 [README 的資料管線腳本](../README.md)）：

- `scripts/build-ids-data.mjs` → `public/ids/ids_babelstone.txt`：BabelStone IDS（無版權主張），台標優先；worker 內做 depth-2 遞迴展開補召回率。
- `scripts/build-glyphwiki-data.mjs` → `public/glyphwiki/composition.txt`：解析 GlyphWiki dump 的 KAGE 99 行，遞迴算筆畫 bbox 經擺放框映射，輸出「字 → 部件 + 實際佔位框（200×200 畫布）」。GlyphWiki 授權完全自由。

### 約定

- **座標映射**：GlyphWiki 200×200 ↔ 字體 em box（top = ascender，y 軸翻轉），見 `src/lib/componentAssembly.ts`。
- **異體映射**：Hanseeker（GPL／非商業授權）已於 2026-06 完全移除；部件異體映射（⺣↔灬 等）改由 GlyphWiki dump 的 related 欄位衍生（`public/glyphwiki/variants.txt`），worker 與 UI 比對都走 `canonicalizeComponent`。PUAExt 字型保留（政府資料開放授權，非 GPL）。
- **不縮放變形**：插入部件靠 `computeCenterPlacement` 純平移置中，靠排序挑比例合適的來源。

## 後續

部件相關新功能優先考慮 GlyphWiki 衍生資料（已含佈局資訊）；未來可評估用 KAGE 引擎渲染初稿輪廓（已提過，未排程）。
