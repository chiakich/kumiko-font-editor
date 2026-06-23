# OpenType feature 工作流

這份文件記錄 Kumiko 對 OpenType feature 的資料模型決策，以及接下來的實作方向。

## 資料模型

OpenType feature 相關資料統一存放在：

```text
FontData.openTypeFeatures
```

核心流程：

```text
.fea 手寫輸入
compiled GDEF / GPOS / GSUB 反組譯結果
        ↓
分類後的 feature / lookup records
        ↓
Kumiko feature model
        ↓
generated .fea
        ↓
binary export compile
```

這包含三種來源：

- 使用者手寫的 `.fea`
- 從 UFO `features.fea` 匯入的 `.fea`
- 從二進位字型的 GDEF / GPOS / GSUB 反組譯出來的 layout 資料

`openTypeFeatures.rawFeatureText` 是手寫或匯入 `.fea` 的第一階段入口。若 raw `.fea` 還不能完整分類，它會被保留並插入 `generateFea(openTypeFeatures)` 的輸出；若已經完整分類成 Kumiko records，generated `.fea` 會改由 records 輸出，避免 raw source 和 model output 重複編譯。

`openTypeFeatures.sourceSections` 是來源層模型。它記錄每段 feature data 從哪裡來、目前處於哪個處理階段、是否已經分類成 Kumiko records，以及 export 時應該如何保留或重建。

目前的正式模型分成三層：

1. `sourceSections`
   - `.fea` source：手寫輸入與 UFO `features.fea`
   - compiled table source：GDEF / GPOS / GSUB 反組譯入口
   - 每個 section 會標記 `origin`、`format`、`stage`、`status`、`preservationPolicy`
2. classified records
   - `languagesystems`
   - `features`
   - `lookups`
   - `glyphClasses`
   - `markClasses`
   - `gdef`
   - `unsupportedLookups`
3. generated output
   - `generateFea(openTypeFeatures)` 產生 disposable build `.fea`
   - binary export compile 使用這份 generated `.fea` 重建 layout tables

`sourceSections.recordRefs` 用來把來源連回分類後的 records。例如 GSUB compiled table source 可以連到 `feature_liga`、`lookup_gsub_0` 和 `unsupported_gsub_0`。這讓 UI 之後可以先顯示來源與 records 的關係，再逐步提供可視覺化編輯。

長期來說，`rawFeatureText` 不應是主要編輯單位。更理想的狀態是把 `.fea` 解析成 Kumiko 可理解的 feature / lookup records，而不是永遠用一整段 raw text 管理。

## 背景補充

OpenType feature 的資料會以兩種完全不同的形態出現：

- source-level `.fea`
  - 有原作者命名、註解、class 組織、lookup block 排版和語意分段。
  - 適合人讀與手寫，但不是字型二進位裡真正保存的形態。
- compiled GDEF / GPOS / GSUB
  - 是 shaping engine 實際讀取的 layout tables。
  - 保留 lookup type、subtable format、coverage、class def、value records 等低階資料。
  - 不保留 source comment、原始命名意圖，也不保證能還原成原本那份 `.fea`。

因此 Kumiko 需要把「來源」和「可編輯模型」分開：

- `sourceSections` 描述資料從哪裡來，以及目前是否已經分類。
- classified records 描述 Kumiko 能理解、能檢視或能編輯的 feature / lookup / rule。
- generated `.fea` 是 build output，用來交給 compiler 重建 layout tables，不承諾長得像原始 source。

`.fea parser` 在這裡有兩層意思：

1. 語法解析：把 Adobe Feature File 語法解析成 AST。
2. 模型轉換：把 AST 中可安全表示的部分轉成 Kumiko records。

目前 Kumiko 沒有完整 Adobe FEA parser。`classifyRawFeatureTextSource()` 是一個保守型 first-pass classifier，只處理非常小、可完整轉換的子集。這個保守性是刻意的：不能完整理解時就保留 raw source，不做半套轉換。

## 反組譯的目標

反組譯不是嘗試還原原作者當初寫的 `.fea` 原始碼。compiled OpenType tables 已經失去註解、命名意圖、class 組織方式和許多 source-level 結構。

Kumiko 的目標比較接近 Glyphs 的做法：

1. 讀取 compiled GDEF / GPOS / GSUB。
2. 依 table、feature tag、script / language、lookup 分類。
3. 盡可能轉成可編輯的 Kumiko rule records。
4. 對目前還不能安全轉成 UI rule 的 lookup，保留在 `unsupportedLookups`，並標記 preservation / rebuild 風險。
5. 重新 export 時，由 Kumiko model 產生新的 `.fea`，再交給 compiler 建回 GDEF / GPOS / GSUB。

所以「不能轉」的意思不是讀不到，而是暫時不能安全地變成 Kumiko 可編輯、可重建且不失真的高階規則。

## Fira Code 觀察

`test_glyphs/FiraCode-Regular.otf` 是很好的測試案例。

它的 coding ligature 主要在 GSUB `calt`，而且大量使用 `GSUB type 6 format 3` chaining contextual substitution。這種資料低階可以讀，也可以用 TTX 看到，但目前 Kumiko 的 parser 還不能把它安全轉成 editable contextual rules。

接手註記：`test_glyphs/FiraCode-Regular.otf` 是本機 regression fixture，但 `test_glyphs` 目前仍在 `.gitignore` 中，所以 `test/openTypeFeatures/firaCodeRegression.test.ts` 會在 fixture 存在時執行、缺少 fixture 時 skip。synthetic binary fixture 仍保留，用來在 CI 鎖定 `GSUB type 6 format 3` 的資料形狀。

因此 Fira Code 可以作為後續反組譯能力的回歸測試：

- 歷史狀態：大量 `GSUB type 6 format 3` 進 `unsupportedLookups`
- 目前 synthetic regression：`GSUB type 6 format 3` coverage / lookup records 會轉成 `ContextualRule`，multi-glyph coverage 會轉成 imported `glyphClasses`
- 目前 Fira Code regression：fixture 存在時，`calt` 的 124 個 `GSUB type 6 format 3` lookup 會重建成 552 條 editable contextual rules，`unsupportedLookups` 為 0
- 目前 generated FEA regression：fixture 存在時，Fira Code 反組譯後的 generated `.fea` 可以交給 fontTools 編譯
- 目前 behavior regression：committed synthetic `KumikoOpenTypeStress.otf` 會比較原始 fixture 與 generated FEA rebuild 後的 HarfBuzz shaping 結果
- 目標：逐步支援 format 3 contextual substitution，讓 `calt` 規則能被分類、檢視、生成合理 `.fea`

## 目前資料流

```text
UFO features.fea
        ↓
openTypeFeatures.rawFeatureText
openTypeFeatures.sourceSections[]
        ↓
classifyRawFeatureTextSource()
        ↓
若可完整分類：openTypeFeatures.features / lookups / glyphClasses
若不能完整分類：保留 rawFeatureText
        ↓
generateFea(openTypeFeatures)
        ↓
features.fea / binary export compiler
```

```text
OTF / TTF / WOFF layout tables
        ↓
extractBinaryFeatures()
        ↓
openTypeFeatures.sourceSections[]
openTypeFeatures.features
openTypeFeatures.lookups
openTypeFeatures.glyphClasses
openTypeFeatures.markClasses
openTypeFeatures.gdef
openTypeFeatures.unsupportedLookups
        ↓
generated .fea / UI / export policy
```

## 目前做到哪裡

已落地：

- `OpenTypeFeaturesState.sourceSections`
  - 來源層正式存在於 `src/lib/openTypeFeatures/types.ts`。
  - raw `.fea`、UFO `features.fea`、compiled GDEF / GPOS / GSUB 都能用同一套 source section metadata 描述。
- raw `.fea` source helpers
  - `setRawFeatureTextSource()` 建立 / 更新 raw source section。
  - 手寫 `.fea` 使用 `origin: manual-input`。
  - UFO `features.fea` 使用 `origin: ufo-import`。
- compiled table source sections
  - `extractBinaryFeatures()` 會為 GSUB / GPOS / GDEF 建立 compiled table source section。
  - section 會用 `recordRefs` 連到 `feature`、`lookup`、`gdef`、`unsupportedLookup` 和 diagnostics。
- raw `.fea` first-pass classifier
  - `classifyRawFeatureTextSource()` 會嘗試把 raw `.fea` 的安全子集分類成 Kumiko records。
  - 成功分類後，source section 會標成 `stage: classified` / `status: classified`。
  - 成功分類後，generated `.fea` 不再重複輸出 raw source，而是從 records 產生。
  - 無法完整分類時，source section 維持 raw，並加 diagnostic；export 仍保留 raw source。
- UI 初步接線
  - Font Features raw source editor 會更新 source section 並嘗試分類。
  - Source panel 會顯示 source sections。
  - Source panel 會把 `sourceSections.recordRefs` 解析成可讀的 feature / lookup / class / diagnostic 摘要，缺失 record 也會標出。
  - Feature detail 與 Lookup inspector 會用同一套 resolver 回看來源 section。
  - Lookup inspector 會顯示 compiled provenance、subtable format 與回指 source sections。
  - Export policy UI 會列出 raw / rebuild / preserve / drop / review 的 export impact。
  - Workflow overview 會顯示 source / compiled / classified 計數。
  - Binary importer diagnostics（例如 FeatureVariations）會併入 workflow diagnostics 與 export policy warnings。
- 測試覆蓋
  - raw source section 建立。
  - raw `.fea` 成功分類與保留 raw 的兩條路。
  - UFO `features.fea` source metadata 與 export 行為。
  - GSUB compiled source section record refs。
  - GSUB `type 6 format 3` chaining contextual substitution 的 synthetic binary regression。
  - Fira Code 本機 fixture regression（fixture 缺少時 skip）。
  - Fira Code generated `.fea` fontTools compile regression（fixture 缺少時 skip）。
  - synthetic OpenType stress fixture 的 HarfBuzz shaping comparison，確認 generated FEA rebuild 後行為一致。
  - GDEF compiled source section。
- GSUB contextual parser
  - `GSUB type 5 format 3` / `type 6 format 3` 會讀取 coverage arrays 與 substitution lookup records。
  - coverage 只有單一 glyph 時輸出 glyph selector；多 glyph coverage 會提升成 imported glyph class。
  - compiled source section 會把 imported glyph class 加進 `recordRefs`，讓 UI 後續可從來源追到 class record。
- GPOS partial reconstruction guard
  - 同一個 GPOS lookup 只要有任一 subtable 不能重建成 editable rules，整個 lookup 會標為 `unsupportedLookups`。
  - 這避免 rebuild layout tables 時只輸出部分 subtable 而靜默丟掉原始 positioning 行為。
- generated FEA contextual round-trip
  - nested lookup blocks 會在引用它們的 contextual lookup 前輸出，避免 fontTools forward-reference error。
  - 沒有 lookup record 的 contextual substitution 會輸出成 `ignore sub ...;`。
  - class selector 會輸出成 FEA glyph class name，而不是 internal class id。
  - `aalt` feature block 不輸出 script / language statements。

已提交的相關 commit：

- `1a51096 feat(opentype): classify raw FEA sources`

## 接下來的實作方向

### 1. `.fea` parser 入口

目前 raw `.fea` 先放在 `openTypeFeatures.rawFeatureText`。

`classifyRawFeatureTextSource()` 會先做保守型 first-pass classification。它只在整段 raw `.fea` 都能被安全理解時，才把內容提交成 Kumiko feature records，並讓 generated `.fea` 改由 Kumiko model 輸出；遇到不支援的語法時，raw source 會繼續保留並交給 compiler/export 使用。

目前可分類的第一批語法：

- `languagesystem`
- glyph class 宣告，例如 `@Letters = [A B C];`
- 簡單 `feature` block
- feature 內簡單 `script` / `language`
- feature 內簡單 `lookup SomeLookup;` reference
- top-level `lookup Name { ... } Name;` block
- `lookupflag` 的 `RightToLeft` / ignore flags / numeric low-bit flags / `MarkAttachmentType` / `UseMarkFilteringSet`
- 簡單 `sub a by a.alt;`
- `substitute` 與 `position` 長關鍵字別名會分類後輸出為標準 `sub` / `pos`
- multiple substitution，例如 `sub a by a a.alt;`
- alternate substitution，例如 `sub a from [a.alt a.swash];`
- 簡單 ligature `sub f i by f_i;`
- contextual substitution，例如 `sub A' lookup SomeLookup B;`
- contextual ignore rule，例如 `ignore sub A A' B;`
- contextual positioning，例如 `pos A' lookup PairLookup V;` 與 `ignore pos X X' V;`
- rule selector 內的 inline glyph list，例如 `pos [A Aacute] [V W] -80;`，會分類成 synthetic glyph class 後輸出
- `markClass` 宣告，支援單 glyph、bracket glyph list 與 glyph class selector
- 簡單 `pos A -20;`
- 簡單 pair positioning `pos A V -80;`
- pair positioning 第二 value record，例如 `pos A V <0 0 -80 0> <0 0 -20 0>;`
- cursive positioning：`pos cursive beh <anchor NULL> <anchor 480 0>;`
- mark positioning：`pos base`、`pos mark`、`pos ligature`
- GDEF table block 的 `GlyphClassDef`、`MarkGlyphSetsDef`、`LigatureCaretByPos` 與 `LigatureCaretByIndex`

後續應該逐步讓使用者貼上的 `.fea` 可以被解析成更完整的 Kumiko model：

- languagesystem
- feature blocks
- lookup blocks
- glyph classes
- mark classes
- GDEF 相關宣告
- diagnostics 和 source map

可以先使用 fontTools feaLib 作為 compiler / parser 的基礎，再決定哪些結構要提升成 Kumiko editable IR。

接手時要注意：

- 不要把現在的 classifier 當成完整 parser。
- 不要在只解析到部分 statement 時就提交部分 records；目前策略是整段可理解才 commit，否則保留 raw source。
- 若要導入 fontTools feaLib parser，要先決定 AST 在 browser / worker / pyodide runtime 的邊界。
- parser diagnostics 要能回到 `sourceSections` 和 raw text 範圍，之後 UI 才能定位問題。

### 2. 反組譯資料分類

binary import 已經會產生 `features` / `lookups` / `unsupportedLookups`。接下來要讓這些資料更像「反組譯出的 `.fea source sections`」：

- 依 `GDEF` / `GPOS` / `GSUB` 分區
- 依 feature tag 分組，例如 `calt`、`kern`、`mark`
- lookup 保留原始 index、type、subtable format、script / language provenance
- UI 可以檢視 generated low-level FEA，即使還不能視覺化編輯

### 3. 補 parser 覆蓋率

優先順序：

1. 擴充 raw `.fea` classifier 的常見語法覆蓋率。
2. FeatureVariations / reverse chaining / extension lookup 的呈現與 preservation policy。
3. 將更多 binary GPOS / GSUB lookup 形狀提升成可編輯 rules，並用 synthetic fixture 驗證 rebuild 行為。

### 4. 接手 checklist

建議下一輪照這個順序做：

1. 決定 Fira Code fixture 的 repository policy
   - 若要讓 regression 在 CI 必跑，將 `FiraCode-Regular.otf` 移到 `test/fixtures/otf/` 並附上對應授權文件。
   - 若維持 `test_glyphs` 為本機 fixture，保留目前 skip-if-missing 測試即可。
2. 擴充 raw `.fea` classifier
   - lookup block：`lookup Name { ... } Name;`
   - contextual substitution：`sub A' lookup X B;`
   - 更完整的 GDEF table block 變體。
3. 補 generated FEA 行為回歸
   - synthetic stress fixture 已驗證 fontTools rebuild 後的 HarfBuzz shaping 行為與原字型一致。
   - Fira Code 目前驗證的是 fontTools 可編譯；若 fixture policy 決定進 repo，可再加 Fira Code 的 HarfBuzz shaping comparison。
4. 補 source-to-record UI
   - 在 Source panel 點 source section 可以看到 `recordRefs`。
   - 點 lookup / feature 可以回看來源 table、lookup index、subtable format 或 raw `.fea` section。
5. 補 export policy UX
   - 明確列出哪些 source 已 classified。
   - 哪些 lookup 會 preserve。
   - 哪些會在 rebuild 時 drop。
   - 哪些 raw source 仍會直接進 generated `.fea`。

### 5. UI 方向

Feature UI 應該避免只是一個大文字框。比較好的形狀是：

- 左側：GDEF / GPOS / GSUB / feature tag / lookup tree
- 中間：選中 feature 或 lookup 的可編輯 rule UI
- 右側或 workflow 區：generated FEA preview、diagnostics、unsupported lookup list、export policy
- raw `.fea` editor 保留，但定位為 source input / advanced escape hatch

## 原則

- `openTypeFeatures` 是唯一 source of truth。
- `.fea` 是輸入與輸出格式；主要編輯模型是分類後的 feature / lookup records。
- compiled tables 反組譯後可以醜，但不能靜默丟資料。
- UI 可以先檢視，再逐步變成可編輯。
- generated `.fea` 是 disposable build output，不承諾長得像原始 source。
