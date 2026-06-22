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

`openTypeFeatures.rawFeatureText` 是手寫或匯入 `.fea` 的第一階段入口。它會被插入 `generateFea(openTypeFeatures)` 的輸出，並在 binary export rebuild layout tables 時交給 fontTools 編譯。

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

因此 Fira Code 可以作為後續反組譯能力的回歸測試：

- 現況：大量 `GSUB type 6 format 3` 進 `unsupportedLookups`
- 目標：逐步支援 format 3 contextual substitution，讓 `calt` 規則能被分類、檢視、生成合理 `.fea`

## 目前資料流

```text
UFO features.fea
        ↓
openTypeFeatures.rawFeatureText
openTypeFeatures.sourceSections[]
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

## 接下來的實作方向

### 1. `.fea` parser 入口

目前 raw `.fea` 先放在 `openTypeFeatures.rawFeatureText`。

下一步應該讓使用者貼上的 `.fea` 可以被解析成 Kumiko model：

- languagesystem
- feature blocks
- lookup blocks
- glyph classes
- mark classes
- GDEF 相關宣告
- diagnostics 和 source map

可以先使用 fontTools feaLib 作為 compiler / parser 的基礎，再決定哪些結構要提升成 Kumiko editable IR。

### 2. 反組譯資料分類

binary import 已經會產生 `features` / `lookups` / `unsupportedLookups`。接下來要讓這些資料更像「反組譯出的 `.fea source sections`」：

- 依 `GDEF` / `GPOS` / `GSUB` 分區
- 依 feature tag 分組，例如 `calt`、`kern`、`mark`
- lookup 保留原始 index、type、subtable format、script / language provenance
- UI 可以檢視 generated low-level FEA，即使還不能視覺化編輯

### 3. 補 parser 覆蓋率

優先順序：

1. `GSUB type 6 format 3`，用 Fira Code 驗證。
2. GPOS partial unsupported 的保守標記，避免重建時默默丟 subtable。
3. FeatureVariations / reverse chaining / extension lookup 的呈現與 preservation policy。

### 4. UI 方向

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
