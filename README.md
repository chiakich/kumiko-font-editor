<img width="1088" height="362" alt="image" src="https://github.com/user-attachments/assets/725fa628-7af8-4aaf-aae8-0950599abad8" />

# Kumiko Font Editor

Kumiko Font Editor 是一個以瀏覽器為核心的字體編輯器，支援 UFO 專案匯入、IndexedDB 草稿儲存，以及透過 GitHub OAuth 與 Cloudflare Pages Functions 載入 GitHub 上的 UFO repo。

## 功能

- 匯入本地 UFO 專案資料夾並解析 `.ufo` 內容到 IndexedDB。
- 從 GitHub repo 載入 UFO 專案，透過 Cloudflare Pages Functions 代理 archive 下載。
- 透過 GitHub OAuth web flow 登入，檢查使用者 fork、列出 branch、推送 commit，並跳轉到 GitHub compare 頁建立 PR。
- 編輯 glyph 路徑、節點、metrics，並保留 dirty glyph 狀態。
- 將草稿保存在瀏覽器 IndexedDB，方便重新開啟。

## 本地開發

這個專案使用 pnpm 10。`package.json` 的 `packageManager` 欄位提供 Corepack 的預設版本；`.npmrc` 會要求使用 pnpm，但允許 pnpm 10.x，避免不同 major 版本重寫 `pnpm-lock.yaml`。

第一次開發前：

```bash
corepack enable
corepack prepare pnpm@10.33.3 --activate
```

如果你的系統上有 Homebrew 或其他方式安裝的舊版 pnpm，可能會蓋過 Corepack shim。這時請優先使用 `corepack pnpm ...`，或移除/升級舊的全域 pnpm。

只測前端 UI：

```bash
pnpm install
pnpm dev
```

若 `pnpm-lock.yaml` 因本機舊版 pnpm 產生大幅格式變更，請先確認：

```bash
corepack pnpm --version
```

版本應為 `10.x`。請不要用 pnpm 8/9 或其他舊版 pnpm 更新依賴。

提交前建議執行：

```bash
pnpm lint
pnpm build
```

如果要測 GitHub 登入、GitHub 載入或任何 `/functions` 路由，請用 Cloudflare Pages Functions 本地模式：

```bash
cp .dev.vars.example .dev.vars
# 編輯 .dev.vars，填入 GitHub OAuth App 的值
pnpm cf:preview
```

`.dev.vars` 需要至少這些值：

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_SESSION_SECRET=...
GITHUB_OAUTH_SCOPE=public_repo read:user user:email
```

`GITHUB_SESSION_SECRET` 請使用夠長的隨機字串，Functions 會用它來簽署 GitHub session cookie。

## 專案結構

### 前端 `src/`

- `src/features/home/`: 首頁、專案匯入入口、最近專案列表，以及本地 UFO / GitHub 匯入流程。
- `src/features/editor/`: editor 的整體版面組合與功能入口，例如 editor 三欄 layout。
- `src/features/editor/canvas/`: 字形編輯主畫布、canvas lifecycle、工具快捷鍵、剪貼簿與文字輸入整合。
- `src/features/editor/leftPanel/`: editor 左側 glyph / component 搜尋、預覽與加入編輯列的 UI。
- `src/features/editor/tools/`: editor 專用互動工具，例如 pointer、pen、brush、hand、text 與 scene controller。
- `src/features/fontOverview/`: 全字庫總覽、分組、搜尋、新增 glyph 與 overview grid。
- `src/features/common/`: 跨主要 feature 共用的 feature-level UI 與 hooks。
- `src/features/common/glyphInspector/`: editor 與 overview 共用的 glyph inspector，包括 glyph summary、node inspector、metrics、儲存與 GitHub commit flow。
- `src/canvas/`: 底層 canvas controller、scene view 與 rendering layers，不直接承擔 React UI。
- `src/store/`: Zustand 全域狀態、glyph 編輯資料模型與 mutation actions。
  - `src/store/index.ts`: store 建立、actions 組合、temporal undo/redo 入口。
  - `src/store/types.ts`: glyph、font、selection、viewport 與 global state 型別。
  - `src/store/glyphGeometry.ts`: path/node 幾何 helper，例如 endpoint 判斷、node lookup、sidebearing recompute。
  - `src/store/glyphLayer.ts`: active/archive glyph layer 讀取與 top-level glyph 同步。
  - `src/store/glyphSearch.ts`: glyph overview/search filtering 與 IDS dictionary。
  - `src/store/editorLine.ts`: editor glyph line、cursor、active glyph index 的同步 helper。
  - `src/store/dirtyState.ts`: dirty/local dirty flags 更新 helper。
- `src/lib/`: 可被多個 feature 共用的資料處理與整合邏輯，例如 UFO/Glyphs 格式、GitHub API、IndexedDB persistence、export worker client。
- `src/workers/`: Web Worker entry points，用於搜尋與大量匯出等較重的背景工作。
- `src/hooks/`: 跨 feature 可共用的 React hooks。
- `src/icons/`: 專案內共用 icon component。
- `src/font/`: 字形路徑資料結構與 font-specific helper。
- `src/assets/`: 前端靜態資源。

### 後端與公開資源

- `functions/api/github/`: Cloudflare Pages Functions，負責 GitHub OAuth、viewer、repo metadata、archive proxy、fork/commit/merge 等 API。
- `public/`: 不經 bundler 處理的公開靜態檔，例如 manifest、favicon、Hanseeker 資料。

### 放置原則

- 新增頁面或使用者流程時，優先放進對應的 `src/features/<feature>/`。
- 只有跨多個 feature 共用且承擔資料處理、外部整合或 domain 規則的邏輯，才放進 `src/lib/`。
- 若只是 feature 內部使用的 helper，優先留在該 feature，例如 canvas 剪貼簿格式放在 `src/features/editor/canvas/`。
- Canvas rendering 放在 `src/canvas/`；editor 互動工具放在 `src/features/editor/tools/`；React component 不應直接塞進 `src/canvas/`。
- 全域狀態集中在 `src/store/`；feature 內若只是整理資料給 UI，優先用 feature-local hook。

## 資料管線腳本

`scripts/` 下的腳本把外部資料來源轉成 `public/` 內供 runtime fetch 的 TSV 檔。來源皆會不定期更新，需手動重跑同步：

| 指令                         | 來源                                                                                           | 輸出                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm data:glyphdata`        | Glyphs [GlyphData.xml](https://github.com/schriftgestalt/GlyphsInfo)（自動下載，BSD 3-Clause） | `public/glyphsdata/glyphdata.txt`：glyph name / altName → unicode、production name |
| `pnpm data:ids`              | BabelStone [IDS.TXT](https://www.babelstone.co.uk/CJK/IDS.TXT)（自動下載）                     | `public/ids/ids_babelstone.txt`                                                    |
| `pnpm data:glyphwiki <dump>` | GlyphWiki dump（需先自行下載 `dump_newest_only.txt`）                                          | `public/glyphwiki/composition.txt`、`variants.txt`                                 |

`glyphdata.txt` 用來把 jf 等 Glyphs 字集清單的 nice name（如 `leftArrow`）正確對應到 Unicode 與匯出用的 production name（`arrowleft`）；CJK 漢字不在該表內，由 `uniXXXX` 慣例演算法解析。詳見 [docs/glyph-naming.md](docs/glyph-naming.md)。

更多設計決策與架構筆記見 [docs/](docs/README.md)。

## 下一步

- 將 GitHub token 改成更完整的 server-side session storage，而不只依賴 signed cookie。
- 擴充更多 UFO metadata 與非 glyph 檔案的 GitHub 回寫流程。
