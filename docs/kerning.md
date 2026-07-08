# Kerning Roadmap

本文件規劃 Kumiko 的 kerning 支援。產品決策是先做「UFO-compatible 的 pair / class kerning」，不做通用 GPOS lookup 編輯 UI；GPOS `kern` feature 由 project kerning data 生成，交給既有 Pyodide fontTools pipeline 編譯。

## 調研結論

開源世界裡，真正「專門做 kerning、且有完整現代 UI 可參考」的 app 很少；多數成熟 kerning 工具是商業外掛或整合在大型 font editor 裡。因此 Kumiko 的參考組合應該是：

- **FontForge Metrics View**：最值得參考的開源 UI。它把 kerning 放在文字預覽工作流裡，而不是孤立表格；同一個 view 可切換 Kerning only / Advance Width only / Both，支援 text input、OpenType feature preview、拖曳 kerning line、數值欄位與 class kerning matrix。
- **Fontra**（本機 `~/work/fontra`）：參考 metrics tool、kerning controller 與 kern feature workflow。重點是「編輯時顯示 effective kerning，資料層仍可保存 UFO-style kerning」。
- **UFO spec**：`groups.plist` / `kerning.plist` 是 canonical storage。`public.kern1.*` 是 pair 第一側 group，`public.kern2.*` 是第二側 group；glyph 在同一側最多只能屬於一個 kerning group。
- **FontGoggles**：不是 editor，但它的 text preview / HarfBuzz shaping / glyph positioning list 很適合作為 preview 與 QA 參考。
- **HT Letterspacer**：偏 spacing/auto-spacing，不是 kerning editor；可參考「自動建議與分類」思路，但不應作為 Kumiko kerning MVP 的 UI 主軸。
- **TruFont**：開源 UFO editor，但專案已標示 discontinued；可當 UFO app 架構參考，不宜當主要產品方向。

參考連結：

- FontForge Metrics View: https://fontforge.org/docs/ui/mainviews/metricsview.html
- FontForge source: https://github.com/fontforge/fontforge
- UFO 3 `groups.plist`: https://unifiedfontobject.org/versions/ufo3/groups.plist/
- UFO 3 `kerning.plist`: https://unifiedfontobject.org/versions/ufo3/kerning.plist/
- FontGoggles: https://fontgoggles.org/ and https://github.com/justvanrossum/fontgoggles
- HT Letterspacer: https://github.com/huertatipografica/HTLetterspacer
- TruFont: https://github.com/trufont/trufont

## 目前狀態

已存在：

- `FontData.kerningGroups?: KerningGroup[]` 與 `FontData.kerningPairs?: KerningPair[]`。
- glyph rename 會同步更新 kerning groups / pairs。
- canonical project persistence 與 GitHub/UFO sync 會保存 project-level kerning data。
- `buildKerningSuggestions` 可把 `FontData.kerningGroups / kerningPairs` 轉成 `kern` feature 的 pair positioning suggestion。
- `openTypeFeatures` 裡已有 Spacing behavior UI，但它是 GPOS IR 的編輯器，不是 UFO kerning canonical model。
- pair resolution engine：`src/lib/kerning/resolveKerning.ts` 依 UFO priority 回答 effective kerning 的值與來源層級，並支援 group 以 id / name / `@name` 三種引用方式。
- Kerning 專用 UI：editor 右側面板 Kerning tab（`src/features/editor/rightPanel/kerning/`），含目前 pair 檢視與數值編輯（step 1/5/10）、pair 清單、group 管理（左右側、membership、同側重複警告）、class exception 建立與還原。
- editor line 即時預覽：`getTextKerningValue` 以 canonical kerning resolver 優先，GPOS `kern` lookup 作為 fallback。
- store actions：`upsertKerningPair` / `deleteKerningPair` / `upsertKerningGroup` / `deleteKerningGroup`，經 zundo 支援 undo/redo。
- UFO kerning I/O：`src/lib/fontFormats/ufoKerning.ts` 解析 / 序列化 `groups.plist` 與 `kerning.plist`；import 時填入 `FontData.kerningGroups / kerningPairs`（`public.kern1.*` / `public.kern2.*` 的完整 key 作為 group id），export（ZIP、GitHub commit、binary export 皆經 `buildMetadata`）由 canonical kerning data 重新產生 plist，非 kerning groups 以 `groupsExtra` 保留 round-trip。
- validation：`validateKerning` 涵蓋空 group、missing glyph、同側重複 membership、pair 引用不存在 group，於 Kerning panel 顯示警告卡片。
- pair 巡覽：pair 清單可一鍵載入編輯列；巡覽字串卡片支援 word list（每行一組字串，點擊載入）。

缺口：

- before/after compare、feature toggle 預覽尚未實作（編輯列本身已走 HarfBuzz shaping）。
- 多 source kerning 仍是 project-level 單一資料，尚未 source-aware（多 master 匯入時取 default master 的 kerning）。
- binary font（ttf/otf）匯入不解析既有 `kern`/GPOS 回 canonical kerning data。

## UI 原則

1. **以文字預覽為主，不以表格為主。** Kerning 是眼睛判斷 pair 關係的工作；第一屏應該是 sample text / pair string，下面才是數值與列表。
2. **目前 pair 必須很明確。** 預覽中選到的 pair 要顯示 left glyph、right glyph、effective value、來源層級（glyph-glyph / glyph-group / group-glyph / group-group / none）。
3. **數值編輯要快。** 提供 number input / stepper，鍵盤上下微調；常用 step 建議 `1`、`5`、`10` units。
4. **class 與 exception 要並排理解。** UI 要能顯示「這個值繼承自 class pair」，並提供「為目前 glyph pair 建立例外」。
5. **group 管理靠近 kerning workflow。** 左側 group（`public.kern1.*`）與右側 group（`public.kern2.*`）要能搜尋、建立、改名、調整 membership，並檢查同側重複 membership。
6. **preview 要支援 shaping context。** 第一版可以先用目前 editor line 的 glyph sequence；後續再加入 HarfBuzz shaping、feature toggle、before/after compare。
7. **多 master 要 source-aware。** UFO kerning 是 per-source 資料；第一版可先作用於 active source，資料模型要預留 `sourceId` 或明確定義 project-level kerning 如何映射到多 source。

## 建議資料模型

先沿用現有型別，補上 importer/exporter 與 resolver：

- `KerningGroup`: `{ id, side: 'left' | 'right', name, glyphs }`
- `KerningPair`: `{ left: GlyphSelector, right: GlyphSelector, value }`

UFO 對應：

- `public.kern1.*` -> `side: 'left'`
- `public.kern2.*` -> `side: 'right'`
- 非 kerning groups 先保存在 UFO source metadata / extras，避免 round-trip 遺失。
- `kerning.plist` top-level dict -> pair list；key 可為 glyph name 或 group name。

Resolution priority 依 UFO spec：

1. glyph + glyph
2. glyph + group 或 group + glyph
3. group + group
4. none

更具體 pair 覆蓋更一般的 class pair；UI 應顯示被覆蓋來源，避免使用者以為 class 值失效。

## 分階段實作

### K0 - 文件與現況對齊（本文件）

- 記錄 UI 參考與產品邊界。
- 明確切開 `openTypeFeatures` Spacing behavior 與 canonical kerning storage。

### K1 - UFO kerning I/O

- 新增 `src/lib/fontFormats/ufoKerning.ts`，解析 / 序列化 `groups.plist` 與 `kerning.plist`。
- import UFO / designspace source 時填入 `FontData.kerningGroups / kerningPairs`。
- export UFO 時寫回 plist，保留未知 non-kerning groups。
- 單元測試涵蓋 glyph pair、class pair、exception、同側重複 membership warning。

### K2 - Pair resolver 與 validation

- 新增 `src/lib/kerning/resolveKerning.ts`。
- API 建議：`resolveKerningPair(fontData, leftGlyphId, rightGlyphId, options)`，回傳 value、source pair、matched groups、priority、conflicts。
- validation 檢查：空 group、missing glyph、同側多 group membership、pair 指到不存在 group。

### K3 - Kerning UI MVP

- 在 editor 增加 Kerning panel，與 OpenType Behaviors 分開。
- 預覽列顯示 sample text，選中 pair 後顯示 pair value editor。
- pair list 支援新增 / 刪除 / 搜尋；group manager 支援 left/right groups 與 membership。
- 支援「建立 glyph pair exception」與「回到 class value」兩個核心操作。

### K4 - 即時預覽與 export 串接

- editor line / canvas preview 套用 resolved kerning value。
- `buildKerningSuggestions` 由 canonical kerning data 產生 `kern` lookup，維持「不展開 class kerning」的策略。
- binary export 與 UFO export 都以 canonical kerning data 為源頭。

### K5 - Polish

- pair set / word list 匯入，支援從常見 kerning strings 快速巡覽。
- before/after compare、feature toggle、HarfBuzz shaping preview。
- 多 source kerning UI：active source kerning、source copy、source diff。
- 自動建議可另開功能，不放入 MVP。

## MVP 不做

- 通用 GPOS lookup 編輯器。
- vertical kerning / `vkrn`。
- variable kerning / HVAR。
- RTL / complex-script kerning 的完整 UI。
- 自動 kerning。
