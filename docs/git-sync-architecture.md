# Git 同步架構

這份文件記錄 Kumiko 的 GitHub 同步從「REST API + 手寫狀態機」走向「OPFS 工作樹 + 真正的 git」的理由、分層與施工順序，並定義一個以 **entity ownership** 為核心的 format adapter 模型，讓 UFO、`.glyphspackage`、`.glyphs` 單檔與未來格式走同一條同步路徑。

定位前提見 [產品定位與開發路線](product-direction.md)：Kumiko 是協作補字平台，同步流程要服務的是「不同貢獻者補不同字」的工作流，不是通用的多人多 master 協作。

## 現況盤點

目前沒有任何真正的 git，是 GitHub REST API 加一套手寫的同步狀態機。

| 層     | 位置                                       | 做法                                                                                                                      |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 傳輸   | `functions/api/github/*`                   | Cloudflare Pages Functions，OAuth token 存 httpOnly cookie、server 端注入。push 走 fork → branch → blob/tree/commit API。 |
| 狀態機 | `src/lib/github/sync/computeSyncReport.ts` | 以 per-glyph `remoteBlobSha` 為基準線，`resolveStatus` 手推 7 種狀態，衝突 per-glyph 解（`keepLocal` / `takeRemote`）。   |
| 序列化 | 三處各自實作                               | 見下。                                                                                                                    |

### 序列化有三份實作

同一件事（把 canonical Kumiko records 變成檔案）目前有三條互不相干的路徑：

1. **匯出**：`src/workers/ufoZipExportWorker.ts` 全量 materialize 到 OPFS（`__kumiko_zip_staging`）再串流打包成 zip，最後在 `finally` 裡刪掉暫存目錄。
2. **commit**：`prepareKumikoGitHubCommit`（`kumikoUfoSync.ts`）只序列化 sync dirty 的 glyph，直接送 REST blob。
3. **pull**：`applyKumikoRemoteSnapshot` 解 archive zip 後逐檔 parse。

三條路各自計算檔案路徑、各自算 hash。這是目前維護成本最高的地方，也是下面所有破口的共同來源。

### 三個實際破口

**破口 1：commit 的覆蓋面比匯出小。** commit 只推 `.glif`、`contents.plist`、`groups.plist`、`kerning.plist`。匯出 worker 會寫的 `fontinfo.plist`、`lib.plist`、`metainfo.plist`、`features.fea`、designspace 完全不進 commit。改 upm、axes、OpenType features 永遠同步不出去，而且 `computeGlyphSyncEntries` 只掃 glyph 目錄底下的 `.glif`，連「不一致」都偵測不到。這是 bug 級落差，且與 git 無關。

**破口 2：pull 一定是全量。** 沒有 commit-level base tree，要拿檔案內容只能靠 `fetchGitHubArchiveSnapshot` 下載整包 zip。一個字的改動也要抓整個 repo，在 CJK 尺度下這是 pull 的主要成本。

**破口 3：push 沒有 pull-then-push。** commit endpoint 永遠開 `kumiko/patch-${Date.now()}` 新 branch。遠端前進之後無法接續，只能再開一個 PR。

### 只支援 UFO

sync 層（`kumikoUfoSync.ts`、`getUfoSource`、寫死的 `.glif` 副檔名）綁死 UFO，GitHub import 的 `collectUfoEntriesFromZip` 找不到 UFO 就直接 throw。`.glyphspackage` 只有本地匯入（`readGlyphsPackageFromFiles`，folder picker）與匯出（`createGlyphsPackageDataFromGlyphBatches` → zip）；`.glyphs` 單檔同樣只有本地匯入匯出。

## git 解決什麼、不解決什麼

**會解決的**

- 基準線收斂成「一個 commit SHA」：merge base 取代散在數萬個 glyph record 裡的 `remoteBlobSha`。
- 增量傳輸：smart HTTP packfile 取代 archive zip 全量下載（破口 2）。
- log、本地連續 commit、branch 切換、revert，以及 fetch → merge → push（破口 3）。

**不會解決的**

- **內容合併。** isomorphic-git 的 merge 是行級文字合併，對 `.glif` / `.glyph` / OpenStep 這類結構化文字只會產生帶 conflict marker 的壞檔。合併必須發生在 entity 層（見下），git 給的是**基準線與傳輸**，不是合併語意。
- **CORS。** GitHub 的 git-http 端點不允許瀏覽器直連，必須自架 proxy。加一條 `/api/github/git/*` 到現有 Pages Functions，繼續在 server 端注入 token，維持 httpOnly 的安全性質。

## 分層

維護性的關鍵是**不讓 OPFS 變成第二個 source of truth**。

| 層             | 職責                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| IndexedDB      | canonical 編輯狀態與 dirty flag，不變（見 [Kumiko project persistence](kumiko-project-persistence.md)） |
| FormatAdapter  | entity ↔ path 對應與雙向序列化，匯出 / commit / pull / import 共用                                      |
| OPFS           | 工作樹 + `.git`，**derived cache，可丟棄、可重建**                                                      |
| isomorphic-git | 只負責 history、merge base、傳輸                                                                        |

硬性約束：**OPFS 裡的東西永遠可以從 IndexedDB + 一次 fetch 重建。** 有了這條，`kumiko-project-persistence.md` 的「不重複保存向量資料」原則沒有被破壞 —— OPFS 是衍生物，不是第二份 geometry。任何時候懷疑工作樹壞了，刪掉重建即可，不需要修復邏輯。

### OPFS 目錄佈局

```
/kumiko/projects/<projectId>/
  worktree/            # materialize 出來的來源樹，佈局與 repo 內完全一致
    MyFont.designspace
    MyFont-Regular.ufo/…
    #（或）MyFont.glyphspackage/…，或單一 MyFont.glyphs
  .git/                # isomorphic-git 的 gitdir，與 worktree 同層
```

`worktree/` 的內容與 repo 的相對路徑一對一，因此 git 的 path 就是 repo 的 path，不需要任何路徑轉換層。原本 `__kumiko_zip_staging` 那種「全域單一暫存目錄、用完刪除」的做法改為 per-project 常駐；匯出 zip 改成「materialize → 打包 worktree」，git commit 改成「materialize → `git.add` → `git.commit`」。

### 效能：不要用 statusMatrix 掃全樹

`statusMatrix` 會對工作樹裡每個檔案算 SHA-1。數萬字的專案不能這樣做。

用 IndexedDB 既有的 `byProjectSyncDirty` index（`listSyncDirtyKumikoGlyphIds`）決定要 materialize 哪些 entity、`git.add` 哪些路徑。**dirty flag 就是比 git 掃描便宜得多的變更偵測器**，這是 Kumiko 相對於一般 git client 的結構優勢，要主動用掉。

## FormatAdapter：以 entity ownership 為核心

### 為什麼不是「檔案樹形狀」

一個看似自然的抽象是「每字一檔 + font 層檔 + 順序檔」的來源樹介面。這個假設在未來格式面前會碎掉：

| 格式              | 檔案結構                                     | glyph ↔ 檔案                     | 序列化    |
| ----------------- | -------------------------------------------- | -------------------------------- | --------- |
| UFO + designspace | 多目錄（每 master 一個 `.ufo`）              | 1 glyph → N 檔（每 master 一個） | XML plist |
| `.glyphspackage`  | 單目錄                                       | 1 glyph → 1 檔（含所有 master）  | OpenStep  |
| `.glyphs` 單檔    | **單一檔案**                                 | **全部 glyph → 1 檔**            | OpenStep  |
| fontra `.fontra`  | 單目錄（`font-data.json` + `glyphs/*.json`） | 1 glyph → 1 檔                   | JSON      |
| ttf/otf 二進位    | 單檔二進位                                   | 不適用                           | —         |

`.glyphs` 單檔不是假想情境：本地匯入匯出現在就支援，`glyphsPatchExport` 就是為它做的。任何以「檔案」為衝突與 diff 單位的抽象，遇到全字體單檔就失效——整個字體變成一個檔案，per-file 衝突模型等於沒有模型。

所以抽象的核心不是檔案樹的形狀，而是 **entity 與 path 的所有權對應**。

### 介面

canonical model 裡的東西定義成一組 entity：

```ts
type EntityId =
  | { kind: 'font'; part: 'info' | 'features' | 'kerning' | 'order' }
  | { kind: 'glyph'; name: string }
```

format adapter 的本質責任只有一件事：宣告每個 repo path 被哪個 entity 擁有、每個 entity 擁有哪些 path，加上雙向序列化：

```ts
interface FormatAdapter {
  readonly id: 'ufo' | 'glyphspackage' | 'glyphs' | …

  // GitHub import 與本地匯入的格式偵測也走這裡
  detect(paths: string[]): DetectResult

  entityOwning(path: string): EntityId | null // null = ignored（UIState.plist…）
  pathsOwnedBy(entity: EntityId): string[]

  // prevFiles 讓保真格式（OpenStep）拿上一版全文做文字 patch；
  // AsyncIterable 讓數萬字能串流寫入 OPFS 而不爆記憶體
  serialize(
    entities: AsyncIterable<Entity>,
    prevFiles: FileReader
  ): AsyncIterable<{ path: string; text: string }>
  parse(files: FileReader, scope?: EntityId[]): AsyncIterable<Entity>

  mergePolicy(entity: EntityId): 'atomic' | 'setMerge'
}
```

git、zip 匯出、同步報告與（長期）import 只認這個介面。各格式的 ownership 對應：

- **UFO**：`glyph:一` → `[Regular.ufo/glyphs/uni4E00.glif, Bold.ufo/glyphs/uni4E00.glif]`。現在貫穿整條 sync API 的 `activeUfoId`（`buildProjectSyncReport({ projectId, activeUfoId })`、`getActiveUfoIdFromArchive()`）徹底從公開 API 消失——「一個 master 一棵樹」只是這個 adapter 的 `pathsOwnedBy` 回傳多個 path。
- **glyphspackage**：`glyph:一` → `[glyphs/uni4E00.glyph]`；`font:order` → `[order.plist]`。
- **`.glyphs` 單檔**：所有 entity → 同一個 path，serialize 用既有的文字 patch 重生該檔。
- **fontra**：佈局天生就是這個模型，幾乎免費。

`font` 拆成 info / features / kerning / order 四個 entity 是刻意的：**entity 切多細，假衝突就有多少**。改 kerning 的人不該跟改 upm 的人相撞；未來嫌粗還能再拆，adapter 介面不動。

## 衝突與合併在 entity 層

合併不發生在檔案層。pull 流程：

1. git fetch（packfile，增量）→ 找 merge base。
2. tree diff 列出變更的 path（便宜，不碰內容）→ `entityOwning` 映射成變更的 entity 集合。
3. 對每個 entity，用 `parse` 讀 base / theirs 兩版（`git.readBlob`），與本地 canonical 做 **entity 層的三方比較**：
   - 只有本地改 → keep local
   - 只有遠端改 → take remote，寫回 IndexedDB
   - 兩邊都改 → 依 `mergePolicy`：`atomic` 進現有的 per-glyph 衝突 UI（`keepLocal` / `takeRemote`）；`setMerge` 自動合（集合聯集 + 確定性排序）
4. 合併後的 entity 重新 serialize 回工作樹，git commit。**永遠不做文字合併**，衝突檔案由合併後的 canonical 重生。

這帶來的直接後果：

- **兩人在同一個 `.glyphs` 單檔裡改不同的字：不衝突。** git 的文字 merge 做不到，entity merge 天生做到。單檔格式從「不可協作」變成「可協作」。
- **glyphspackage 改同字不同 master 也能正確處理**——parse 之後比較的是 canonical layer，粒度要多細有多細。衝突粒度是 entity 模型決定的，不是檔案佈局決定的。
- **`contents.plist` / `order.plist` 的經典假衝突消失。** 兩人各補一個新字都會動順序檔，`font:order` 宣告 `setMerge` 就自動合掉。
- **per-glyph `remoteBlobSha` 整個退役。** 基準線就是 merge-base commit，本地變更偵測就是既有的 `syncDirty` flag。散在數萬筆 record 裡的基準線欄位、`gitBlobShaFromText`、`fetchRemoteTree` 的逐檔比對全部收斂。

### 代價與邊界

- **單檔格式的 parse 是 O(整檔)。** 改一個字要 parse 三版全文。可接受：單檔格式天生如此，CJK 規模的專案本來就該勸離 `.glyphs` 單檔改用 package；模型上它能正確運作，只是慢。
- **二進位格式明確出局。** adapter 契約是 text-first，ttf/otf 專案維持 import-only，不給 git sync。
- **rename 是 entity 層的 delete + add**，不做 git rename 偵測。

### 工作樹讓 Glyphs 的保真更乾淨

`.glyph` / `.glyphs` 是 OpenStep plist，對未知欄位與欄位順序敏感。目前靠 `exportGlyphsByPatchingText`（`glyphsPatchExport.ts`）做文字 patch 來保真，基準是原始匯入時的整份文字。

有了 OPFS 工作樹，`serialize` 的 `prevFiles` 直接讀工作樹裡的上一版檔案——git 工作樹天生就是「上一版全文」的載體。這比現況乾淨，也順帶讓 UFO 那邊 `sourceData.ufo.fontinfoExtra` / `libExtra` 這類「保留未知欄位」的欄位有機會簡化。

## 多 master 同步：曾經的缺陷與現行模型

2026-08 施工 Phase 0 時發現、並在 Phase 1 收尾時修掉的 bug，保留紀錄因為它解釋了現行的基準線形狀。

### 曾經的行為

`prepareKumikoGitHubCommit` 與 `buildKumikoProjectSyncReport` 都吃一個 `activeUfoId`，只處理那一個 `.ufo`。多 master 專案因此：編輯 Bold master 的某個字 → 標為 `syncDirty` → commit 時 `toUfoGlyphRecord` 用 `activeUfoId` 投影，寫出的是這個字的 **Light** layer → `markKumikoGitHubCommitSynced` 把 `syncDirty` 清成 0。Bold 的修改從未進到 `Bold.ufo`，dirty 標記已清，之後也不會再被推送——靜默的同步遺失。本地資料一直是完整的（zip 匯出走 manifest，涵蓋所有 UFO）。

### 現行模型

glyph 的同步基準線原本是單一純量 `sourceData.ufo.remoteBlobSha`，但一個 glyph 在多 master 下對應 N 個檔案（每 master 一個），各有自己的 remote blob SHA。這正是 `FormatAdapter` 的 `pathsOwnedBy` 回傳 N 個 path 的情況，儲存層現在跟上了：

- glyph 基準線改為 `sourceData.ufo.remoteBlobShaByUfoId`（`ufoId → blob SHA`）。舊的純量欄位保留為讀取相容，只在 primary master 上採用，並在下次 commit 時被寫成 map。
- commit、sync report、pull 三條路徑都迭代 `listProjectUfoSources(project)`，不再只看 active UFO。
- `activeUfoId` 已從公開 API 消失（`prepareKumikoGitHubCommit`、`buildKumikoProjectSyncReport`、`applyKumikoRemoteSnapshot`、`markKumikoGitHubCommitSynced`），只留在各 adapter 內部當作「選哪一個 UFO」的參數。
- pull 對同一個字在多個 master 都有遠端變更時，逐 master 合進同一筆 glyph record 的不同 layer，而不是後者覆蓋前者。
- `remoteDeleted` 只有在**每個** master 都不再持有該字時才刪除 canonical 記錄。

回歸測試在 `test/githubSync/kumikoUfoSync.test.ts`：commit 寫到每個 master、各 master 拿到自己的 layer 幾何、基準線逐 master 分開。

## 前提升級：通用多 master 協作

目前的設計以「不同貢獻者補不同字」為前提。若前提升級為通用的多人多 master 協作，架構骨架（分層、git 只管基準線與傳輸、entity 三方合併、dirty flag 驅動）不變——這正是把粒度做成旋鈕的原因。會動的是四處：

**1. EntityId 長出 master 維度（便宜）。** UFO 的 kerning.plist 每個 master 一份，兩人各調不同字重的 kerning 不該撞出假衝突；glyph 同理：

```ts
type EntityId =
  | { kind: 'font'; part: 'info' | 'features' | 'order' }
  | { kind: 'font'; part: 'kerning'; masterId: string }
  | { kind: 'glyph'; name: string; masterId?: string }
```

介面不動，只是 key 的形狀變細。

**2. glyph 的 mergePolicy 從 `atomic` 升級成 `structural`（貴，可延後）。** 兩人改同一個字的不同 master，逐 layer 三方合併在資料層可行（parse 後比的是 canonical layer）。危險在**插值相容性**：一邊改了輪廓結構（點數、contour 順序、component 結構），逐 layer 合併後兩個 master 可能不再 point-compatible——資料層合併成功、語意層是壞的。所以 `structural` 必須帶 post-merge 驗證：

```ts
mergePolicy: 'atomic' | 'setMerge' | { kind: 'structural'; validate: (merged) => ok | escalate }
```

合併後跑相容性檢查（已移植的 VariationModel 與 quality check 基礎設施可直接用），不相容就升級成人工衝突。「自動合併必須過語意驗證，過不了就 escalate」是新前提下唯一新增的架構規則。

**3. 衝突 UI 從二選一變成 per-layer + 插值預覽（貴）。** 多 master 下使用者需要看到合併後各字重長什麼樣、插值有沒有壞，再做決定。UI 工程量，不是模型變動。

**4. 認領制（便宜且最划算）。** Weblate 式的 glyph claiming 掛在現有待補字清單上，把「兩人同時改同一個字」的機率壓到很低——衝突最好的處理方式是不發生。它決定第 2、3 點的急迫性：有認領制，`structural` merge 可以晚做甚至不做。

## 即時共編：邊界與可達路徑

git 是非同步協作模型。如果要 Figma 式即時共編，那是另一條通道，不能塞進 git 層——但也不需要推翻這套分層。這節記下邊界與已想清楚的路徑，免得日後重推。

先拆穿「Figma 式」這個詞：**Figma 自己不是 CRDT，也不合併同一物件的併發編輯**。它的做法是每份文件一個中央伺服器程序、property 級 last-writer-wins，兩人同時拖同一個點就是後者贏。這個誠實版的模型對 Kumiko 是可達的。

### 分層上的位置

即時 session 是 **canonical 之上的短暫覆蓋層**，不是第三個 source of truth：

```
DO session（op log，短暫）→ 各端 IndexedDB（canonical，不變）→ git（基準線，不變）
```

session 結束或斷線，狀態落回 IndexedDB；git 同步完全不知道即時層存在。斷線重連 = op log 補放 + snapshot catchup。這條規則守住，三層就不會互相污染。

### 已有的零件

- `src/hooks/useProjectBroadcastSync.ts` 就是單機版的即時共編：BroadcastChannel 廣播 `project-draft-saved`，接收端用 `projectBroadcastPolicy` 判斷「哪些 glyph 變了、我開著的有沒有被動到、dirty 時能不能合併」。把 BroadcastChannel 換成 WebSocket，這套政策直接升級成網路版接收邏輯。
- Cloudflare 已是後端。**Durable Objects** 正是「每份文件一個中央協調程序」的原生對應：每個 project 一個 DO，收 op、定序、廣播、存 op log。
- **entity 模型直接複用**：廣播與訂閱的單位就是 `EntityId`，LWW 粒度就是 entity 粒度。
- immer 已在編輯路徑上，`produceWithPatches` 天生產生可廣播的 op。

### 成本排序

**便宜且值錢（80% 的體驗）**

1. **Presence**：誰在線上、誰開著哪個字、游標與選取。純廣播，不碰資料一致性。
2. **glyph 級直播 + 軟鎖**：某人正在編輯的字對其他人唯讀（掛在待補字清單的認領制上），編輯中的 glyph 以 debounce 整字廣播。粒度是整個 glyph 的 LWW——對補字工作流，這已是完整的「即時協作感」。

**貴且價值低（可以永遠不做）**

3. **同一個字的點級共編**：需要 point/contour 級 op 定序，且併發改動輪廓結構會弄壞 master 間的 point compatibility。連 Figma 都不合併這種情況（LWW 蓋掉），字體編輯更沒理由做。軟鎖 + glyph 級 LWW 在語意上更正確。

**真正的隱藏成本是 undo。** zundo 是單人線性歷史；多人下 undo 必須「只撤自己的 op、以逆操作重新提交」，這是對編輯管線的侵入式改動，比 WebSocket 本身難。做第 1、2 層時可以繞開——軟鎖保證同一字只有一人在編，單人 undo 語意不變。這也是把粒度停在 glyph 級的另一個理由。

### 順序

即時層排在 git 同步之後：git 層是資料交換的地基（沒有它，即時 session 的成果出不去），即時層是體驗放大器。最優停靠點是 presence + glyph 軟鎖 + glyph 級直播，與「不同人補不同字」的產品定位同構，並避開 undo 重構與 point compatibility 兩個大坑。

## 施工順序

**Phase 0 — 修現況破口（不加依賴）**

把 commit 的檔案清單對齊匯出：`fontinfo.plist`、`lib.plist`、`metainfo.plist`、`features.fea`、designspace 都要進 commit 與同步報告。破口 1 現在就是 bug，不該等 git。

**Phase 1 — 抽出 FormatAdapter**

從 `ufoZipExportWorker.ts` 抽出 UFO 的 `FormatAdapter` 實作，匯出與 commit 共用。介面第一天就用 entity ownership 這一版，不要先寫「檔案樹形狀」版之後回頭改。這步結束後三份序列化變一份，即使最後不上 git 也划算。

順序上分兩段：先做 entity ownership 與共用 materializer（無 schema 變更），再做多 master 同步修復（見上節，含 glyph 基準線的 schema 變更）與 `activeUfoId` 的移除。**兩段皆已完成（2026-08）。**

OPFS 常駐工作樹**不在 Phase 1 做**：在 git 接上之前沒有任何消費者，提前常駐只會替每個 CJK 專案多背數萬個檔案與一份無人讀取的過期狀態。改到 Phase 2 與 isomorphic-git 一起落地。

**Phase 2 — 接 isomorphic-git（機制已完成，尚未成為預設）**

加 `/api/github/git/*` proxy；git 只負責 fetch / merge base / commit / push；衝突偵測換成 entity 三方比較，UI 沿用現有 per-glyph 解法。fork / compare / merge 這些 GitHub 專屬操作繼續走現有 REST endpoint——git 只取代資料平面。

已落地（2026-08）：

| 模組                                   | 職責                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/git/fileStore.ts`             | 儲存 port：`FileStore`，只談 bytes 與目錄                                  |
| `src/lib/git/gitFileSystem.ts`         | 把 `FileStore` 包成 isomorphic-git 的 `PromiseFsClient`，帶 POSIX 錯誤碼   |
| `src/lib/git/opfsFileStore.ts`         | OPFS 實作，是整個 git 堆疊裡唯一認識 `FileSystemDirectoryHandle` 的地方    |
| `src/lib/git/worktree.ts`              | per-project repo：init、從 materializer 寫工作樹、staging、commit、discard |
| `src/lib/git/remote.ts`                | 經自家 proxy 的 fetch / push、merge base、`readBlobAtCommit`               |
| `src/lib/git/entitySync.ts`            | entity 層三方比較與依 entity 分組（跨 master 收斂成一個判斷）              |
| `src/lib/git/gitSync.ts`               | 串起來：materialize → fetch → merge base → 報告 / commit / push            |
| `functions/api/github/git/[[path]].ts` | git-http proxy，只開放三個 smart-HTTP 端點                                 |

設計要點：

- **OPFS 工作樹是 derived cache。** `syncWorktreeFromProject` 會刪掉 materializer 不再產出的檔案，`discardGitWorktree` 隨時可整包丟棄重建。
- **不靠 `statusMatrix`。** staging 只針對 materializer 回報的路徑，數萬字的工作樹不會被整棵樹 hash。
- **merge base 取代逐檔基準線。** 三方比較直接讀 base commit 的 blob，因此不再有「基準線未知」這個狀態。
- **兩邊改成一樣不是衝突**，是收斂；任一 master 衝突則整個 glyph entity 升級為衝突。
- **proxy 不轉發呼叫端 header**，token 由 server 端注入，回應只放行 content-type。

尚未完成，刻意留給手動驗證之後：

- git 路徑目前是 **opt-in**（`kumiko.app.gitSyncEnabled.v1`，預設關閉），現行 REST 同步仍是預設。切換為預設前需要對真實 repo 驗證 fetch / push 與 CJK 規模的 OPFS 效能——這兩件在單元測試環境裡驗不了。
- `remoteBlobSha` / `remoteBlobShaByPath` **尚未退役**：REST 路徑還在用。git 成為預設後才移除。
- **只有「產生報告」接上了 UI**（在開關後面）。`commitAndPushProject` 已實作並測過，但尚未接線：它目前 push 到 `target.branch`，而 fork-based 貢獻流程需要推到使用者 fork 的分支，接線時要沿用現有 `fork-status` 的分支解析。
- pull 的套用仍走 REST 的 `applyKumikoRemoteSnapshot`。
- git 堆疊是**動態載入**的（`syncEngine` 只在開關開啟時 `await import`），打包成獨立的 `gitSync` chunk（約 266 kB / gzip 80 kB）。走 REST 路徑的使用者不會下載它。
- 效能上刻意用 blob OID 比較而非讀取內容：`collectLocalTree` 只保存 hash，`collectTreeOids` 一次 `git.walk` 取整棵樹，避免 CJK 規模下數萬次 blob 讀取。內容只在真正要套用遠端變更時才讀。

**Phase 3 — 更多格式上同步路徑**

實作 glyphspackage（與之後的 `.glyphs` 單檔）的 `FormatAdapter`，GitHub import 的格式偵測走 `detect`：repo 裡同時有多種來源就讓使用者選（`masterImportSource.ts` 已有 glyphspackage 偵測邏輯可重用，選擇 UI 有 `designspaceCandidates` 的前例）。

**長期 — import pipeline 收進 adapter**

`readGlyphsPackageFromFiles`、`collectUfoEntriesFromZip`、GitHub archive 解析是三套平行的匯入實作，長期都該收進 `detect` + `parse`。不用第一天做，但方向要定，否則 adapter 只覆蓋 sync、import 又長出平行實作。

## 要保留的既有決定

- OAuth token 留在 httpOnly cookie、只在 server 端注入，git proxy 不得破壞這點。
- 衝突解在 glyph 粒度的 UI（`keepLocal` / `takeRemote`）不變，變的是底層判斷從逐檔 SHA 比對換成 entity 三方合併。
- fork-based 貢獻流程不變：貢獻者 push 到自己的 fork，PR 回上游。
- 匯出 dirty 判斷用的 FNV `sourceHash` 不變；退役的只有同步基準線 `remoteBlobSha`。
