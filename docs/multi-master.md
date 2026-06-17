# 多 Master 支援：Roadmap Spec

本文件規畫 Kumiko 的多 master（多 source）支援，作為 [Variable Font 支援](variable-fonts.md) 的前置工程。產品脈絡見 [產品定位與開發路線](product-direction.md)，跟進 fontra 的策略見 [與 fontra 的相容與跟進策略](fontra-parity.md)。

variable-fonts.md 預設了 `FontData.sources` 已填妥多個 master；本文件補上「這些 master 從哪個檔案格式來、如何進入資料模型、如何在 UI 切換」這一段。

## 範圍

讓同一個字體擁有多個 master，於 overview 與 editor 切換檢視/編輯任一 master，並讓各來源格式（`.glyphs` / `.glyphspackage` / `.designspace` + 多 `.ufo` / 單一 `.ufo`）的多 master 資料能正確進出。

不在本文件範圍：插值與設計空間任意位置預覽（屬 variable-fonts.md）。本文件只負責「離散的 master 集合」與其切換。

## 核心概念：master 是字體層級，layer 是字形層級

這條界線決定整個狀態設計：

- **master / source**：字體層級（font-wide）。存於 `FontData.sources[id]`，帶 `location`（設計空間座標）與 `name`。
- **layer**：字形層級（per-glyph）。`GlyphData.layers[layerId]`，每個 master layer 以 `associatedMasterId` 指回某個 source；`type: 'backup'` 的 layer 與 master 無關，是單字內的快照。

在某個字內，「目前要編輯/檢視的 master layer」＝該字中 `associatedMasterId === activeMasterId` 的 layer。Glyphs 與 fontra 皆採此模型。

### 資料模型：layers 即唯一真相（對齊 fontra）

歷史上 Kumiko 把作用中 layer 的內容存成 `GlyphData` 的 top-level（`paths` / `metrics` …），`glyph.layers` 只放 backup 快照，兩者靠 `syncGlyphTopLevelFromLayer` / `overlayHotFontData` 對帳——同一份資料存兩處，是 desync 來源。

fontra（`classes.py`）的 `VariableGlyph` 無 top-level 內容，`layers: dict[name → Layer]` 即唯一真相，`sources` 是 `location → layerName` 的對應；Glyphs 同構。M1 將 Kumiko 對齊此模型：

- `GlyphData` 移除 top-level 內容欄位；內容只存 `glyph.layers[layerId]`（每個 layer 即 fontra 的 `StaticGlyph`）。
- `glyph.activeLayerId` 指向目前編輯/檢視的 layer；存取一律經 accessor（`getGlyphLayer` / active-layer helper），編輯直接 mutate 該 layer 物件，**不再有拷貝**，desync 結構上不可能。
- master layer 與 backup layer 並存於同一 map，以 `type` 區分；master 另帶 `associatedMasterId` 指回 source。

### sparse master

補字情境下，某字可能尚無某 master 的 layer（sparse）。資料模型上即「該 glyph 的 layers 沒有對應 `activeMasterId` 的項目」。UI 需明確標示並提供「建立此 master 的 layer」（空白或自預設 master 複製）。

## 現況盤點

### 已就緒

- 資料模型支援多 master：`FontData.axes`、`FontData.sources`（各帶 `location`）、`GlyphLayerData.type: 'master' | 'backup'` 與 `associatedMasterId`（`src/store/types.ts`）。
- 插值演算法已移植（見 variable-fonts.md），與多 master 解耦。
- 既有 layer 取值：`getGlyphLayer(glyph, layerId)`（`src/store/glyphLayer.ts`）；M0 已加 `activeMasterId` / `editLocation` / `getActiveLayer` 接縫。
- UFO 匯入會建立 `sources`：`fontSourcesFromLib()` / `fontAxesFromLib()`（`src/lib/fontFormats/ufoFormat.ts`、`fontInfoSettings.ts`）。
- 既有 backup layer 切換 UI：`LayerListCard`（`src/features/editor/rightPanel/components/LayerListCard.tsx`）。

### 缺口

- **glyph 模型未對齊 fontra**：（M1 已解決）已遷移成 layers-as-truth。
- **`.glyphs` / `.glyphspackage` 根本沒有匯入**：匯入 UI 只接受 `.ufo,.ttf,.otf,.woff,.woff2`，`importLocalProjectFiles` 只有 binary + UFO 兩條路；src 內**無 glyphs 輪廓/節點解析**，`projectGlyphsDocument` 從未被設值。既有 `glyphsExport` / `glyphsPatchExport` 僅是匯出 / patch round-trip 骨架，未觸發。先前以為「glyphs 多 master 被壓平匯入」是誤判——沒有 glyphs 匯入可言。
- **無 `.designspace` 支援**：`src/` 無任何 designspace 解析，多 `.ufo` 無法以多 master 形式載入（目前 `UfoProjectRecord.ufoIds[]` 僅載 `selectedUfoId` 一個）。這是**唯一務實的多 master 資料來源**（建在已可用的 UFO importer 上）。
- **渲染只畫單一 layer**：Canvas 取作用中 layer，未依 `activeMasterId` 解析。
- **無 master 切換 UI**：overview / editor 皆無 master 切換器。

## 各來源格式的多 master 對應

| 來源 | 多 master 載體 | 目前 | 目標 |
| ---- | -------------- | ---- | ---- |
| `.designspace` + 多 `.ufo` | designspace XML + N 個 ufo | 不支援 | 解析 designspace → `axes`/`sources`/`instances`，逐 source 載入成多 master layers |
| 單一 `.ufo` | 一個檔＝一個 master | 正常（單一 source） | 維持 |
| `.glyphs` / `.glyphspackage` | 內建 `fontMaster` + 每字多 layer | **無匯入**（僅匯出骨架） | 之後獨立實作完整 importer（OpenStep 輪廓/節點/master 解析） |

> UFO 格式本身一個 `.ufo` 即一個 master；UFO3 的 layer 是 background/替代字形用途，**不可**作為插值 master。多 master 一律走 `.designspace` + 多 `.ufo`。

## 架構設計

### 狀態模型

新增字體層級的 active master，與既有 per-glyph backup 選擇分離：

- store 新增 `activeMasterId: string | null`（＝ `FontSource.id`）與 `setActiveMasterId(id)`。
- 新增解析輔助：`getActiveLayer(glyph, activeMasterId)` → 回傳該字中 `associatedMasterId === activeMasterId` 的 master layer；無則回 `null`（sparse）。
- `selectedLayerId` 收斂為「單字內是否改看某 backup layer」的覆寫；未覆寫時 editor 編輯目標＝active master layer。

#### 為 VF 預留：editLocation 從一開始就存在

關鍵接縫：多 master 的選擇是**離散的**（只能落在某個既有 master），但 variable font（variable-fonts.md Phase 1）需要的是**連續的設計空間 location**。為避免 VF 階段回頭重做狀態層，本期就把「目前位置」設計成 location：

- store 同時持有 `editLocation: Record<string, number>`（設計空間座標）。
- `setActiveMasterId(id)` 內部除了設 `activeMasterId`，也把 `editLocation = sources[id].location`（master 切換＝吸附到該 source location，是 location 的特例）。
- `activeMasterId` 由 `editLocation` 反查：恰好等於某 source location 時即該 master，否則為 `null`（位於 master 之間）。

如此 VF 階段只需：(1) 解除「location 必須等於某 master」限制、加軸 slider；(2) 渲染分支多一條——落在 master 上 → `getActiveLayer` 走編輯路徑，落在 master 之間 → 插值器產 read-only instance。`getActiveLayer` 與插值器並存而非互斥。

### 匯入

統一目標：所有來源都填出 `FontData.axes` + `FontData.sources` + 每字的 master layers，並設定初始 `activeMasterId`（default master）。

- **`.glyphs` / `.glyphspackage`**：解析 `Axes` → `axes`；`fontMaster[]` → `sources`（`id`=master id、`name`=`customName`/`name`、`location`=各軸值）；每字各 `layer`（其 `layerId` 對應 master）→ `GlyphLayerData{ type:'master', associatedMasterId }`。`projectMetadata.fontMasters` 仍保留供 round-trip。
- **`.designspace` + 多 `.ufo`**：解析 designspace XML → `axes` / `sources` / `instances`（→ `exportInstances`）；逐 `<source>` 載入對應 `.ufo` 字形到該 master layer；ufoPersistence 的 `ufoIds[]` 真正對映成 sources。
- **單一 `.ufo`**：維持現狀。

### 匯出

- `.glyphs`：沿用既有 round-trip。
- UFO 多 master：匯出 `.designspace` + N 個 `.ufo`（新）。

### 渲染

GlyphCard 與 Canvas 改以 `getActiveLayer(glyph, activeMasterId)` 取得輪廓，而非 `glyph.paths`：

- GlyphCard：傳入 `activeMasterId`，以對應 layer 的 `paths` / `componentRefs` 餵 `buildGlyphPreviewData`。
- Canvas：`activeLayerId` 解析順序為 `selectedLayerId(backup 覆寫)` → active master layer → `null`。

## UI 設計

overview 與 editor 共用同一個 master 切換器元件，差別只在擺放位置：

- **少量 master（≤4~5）**：segmented pills，逐顆顯示 master `name`，選中態以 `info` 底色，hover 顯示 `location`。
- **數量多或名稱長**：退化為「目前 master + dropdown」。建議規則：master 數 ≤4 用 pills，>4 用 dropdown。
- **sparse**：此字無該 master layer 時，pill / 列以虛線框 + `+` 表示「點此建立 layer」。

擺放位置：

- **Overview**：放在字符總覽標題列右邊（`OverviewContent.tsx` 的 title + Add Glyph `HStack` 內，title 右側）。
- **Editor**：浮動於 canvas 上方（既有 `CanvasWorkspaceOverlay` 工具列在底部置中；master 切換器置於頂部，與工具列分離）。

### Master 名稱是自訂的

master 名稱無固定字串（Glyphs 的 `customName`、designspace 的 source name 皆任意），不可假設為 Regular/Bold，數量也不固定。元件須：

- 名稱任意長度 → `max-width` + 截斷 + tooltip。
- 名稱為空 → fallback 以 `location` 組標籤（如 `wght 700`）。
- hover 顯示完整 `location`。

## 分階段實作

### M0 — 狀態拆分與渲染解耦（已完成）

- store 新增 `activeMasterId` / `editLocation` / `setActiveMasterId`（master 切換連帶設 `editLocation = source.location`，VF 的連續 location 是其推廣）。
- 新增 `getActiveLayer(glyph, activeMasterId)`；overview GlyphCard 改走之。
- 單 master 行為不變。

### M1 — glyph 模型遷移到 layers-as-truth（基礎重構，已完成）

對齊 fontra，消除 hot/layers desync。單 master、使用者無感的純內部重構，以單一原子 commit 一刀切。

- `GlyphData` 移除 top-level 內容欄位；內容只存 `glyph.layers[activeLayerId]`。
- accessor：`activeLayer` / `ensureActiveLayer` / `getGlyphLayer` / `withActiveLayer` / `setGlyphActiveLayer` / `normalizeGlyphToLayers`。
- 刪除 hot↔layers 對帳；persistence 改讀/寫 active layer；舊資料於 `ingestProjectData` 自動遷移。

### M2 — `.designspace` + 多 `.ufo` 匯入（多 master 資料來源）

> 修正：原規劃的「`.glyphs` 多 master 展開」前提不成立（glyphs 無匯入）。改以 designspace 為多 master 的第一個資料來源，建在已可用的 UFO importer 上。

- 解析 `.designspace` XML → `axes`（`FontAxes`）、`sources`（每個指向一個 `.ufo`，帶 `location` / `name`）、`instances`（→ `exportInstances`）。
- 逐 source 載入其 `.ufo` 字形，合併成「一個 `GlyphData`、每 source 一個 master layer」（`type:'master'`、`associatedMasterId`=source id）；`activeLayerId`=default source。
- persistence：`ufoIds[]` 對映成多 source；匯入 UI 接受 `.designspace`。
- 測試：designspace 解析 + 多 master 合併的 characterization。

### M3 — Master 切換 UI

- 共用切換器元件（pills / dropdown 自動切換、sparse 標示）。
- overview 標題右側、editor canvas 上方各掛一份，接 `setActiveMasterId`。

### M4 — 匯出與 Master / sparse layer 管理

- UFO 多 master 匯出 designspace + 多 ufo。
- sparse layer 建立（空白 / 自預設複製）；master 新增 / 刪除 / 改名管理 UI。

### 之後

- `.glyphs` / `.glyphspackage` 完整 importer（OpenStep 輪廓/節點/master 解析 → FontData）——獨立功能。
- 接 variable-fonts.md 的插值預覽 Phase 1→4（在離散 master 之間於任意 location 插值）。

## 待決策

- **`activeMasterId` 與 `selectedLayerId` 的收斂**：是否將 backup 覆寫完全併入 `selectedLayerId`，或另設獨立旗標。
- **sparse layer 預設內容**：空白或自 default master 複製輪廓。
- **離散軸**：italic 等離散軸於 `FontAxis` 是否加 `values`（與 variable-fonts.md 共用此決策）。
- **designspace 解析範圍**：avar（`<map>`）、`<instance>`、discrete axis（`values`）初期支援到哪。
- **`.glyphs` importer（之後）**：無 `Axes` 區塊的舊檔，自 master 的 `weightValue` / `widthValue` / `customParameters` 推回 axes。
- **editLocation 的表示**：用原始設計空間座標或正規化座標儲存；以及 `activeMasterId` 反查 master 時 location 比對的容差（floating point 相等）。

## fontra 對應檔案（參考來源）

| 主題 | fontra 檔案 |
| ---- | ----------- |
| glyph 多 layer / master 控制 | `src-js/fontra-core/src/glyph-controller.js`（`VariableGlyphController`） |
| 設計空間 / source 導覽 UI | `src-js/views-editor/src/panel-designspace-navigation.js` |
| 多 source 同步編輯 | `src-js/views-editor/src/scene-controller.js`（`editLayersAndRecordChanges`） |
| 資料模型定義 | `src-js/fontra-core/src/classes.json` |
