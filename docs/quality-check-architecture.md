# 自動品質建議標準

這套品質建議不是「字好不好看」的評分器，而是一套幫設計師維持整套中文字體一致性的量尺。它把設計中常靠經驗判斷的事情拆成可觀察的幾何特徵：字面邊界、字面比例、墨量、重心與對稱性。當某個字偏離這套字已經建立出的規則時，系統會把偏離處翻成可操作的建議。

核心目標有三個：

- 在設計前期建立可討論的字面規則，而不是只靠一個模糊的「平均字面框」。
- 在編輯單字時，用凍結的尺量正在改動的筆，避免設計師邊改邊失去整套字的參照。
- 在審稿時把注意力集中到最可能破壞一致性的字，而不是讓設計師逐字肉眼掃描。

## 設計依據

3type「中文字体解密组」報告指出，漢字真正的字面不是固定的平均框，而是由最外側的邊界筆畫定義。邊界筆畫又可分成兩類：

- **框架筆畫**：以線定義字面框，例如口框、左右直邊、上下橫邊。
- **樹枝筆畫**：以點或端部定義字面框，例如撇、捺、點、外伸端點。

因此，我們不把所有字丟進同一個框裡比較，而是先問：

- 這個字目前的真實外框在哪裡？
- 每一邊是框架筆畫，還是樹枝筆畫？
- 這種邊界在這套字裡通常會落在哪個範圍？
- 這個字的寬、高、墨量、重心，是否符合它的複雜度與結構？

這些問題讓品質建議更接近字體設計工作本身：它不是要求所有字一樣大，而是檢查不同外型的字是否遵守同一套設計邏輯。

## 它怎麼幫助設計

設計師可以把這套標準用在三個階段：

- **建立規則**：用固定尺字組和全字體統計觀察四邊常見範圍，決定這套字的框架筆畫、樹枝筆畫要靠近或遠離字身框多少。
- **即時校正**：編輯頁會把目前字的邊界與基準範圍畫在畫布上，並在 Inspector 顯示「左側留白過多」「字面偏窄」「重心偏右」這類可操作建議。
- **批次審查**：品質檢查 modal 依離群程度排序可疑字，讓設計師優先檢查最可能破壞一致性的字。

這套系統特別適合找出「整體看起來不太對，但一時說不出哪裡不對」的問題，例如：

- 同樣是口框字，有的字框比其他字明顯外張或內縮。
- 複雜字應該比簡單字更飽滿，但某個字反而太小。
- 左右框架字看似對稱，實際 lsb 和 rsb 不平衡。
- 單字灰度比其他字黑或淡，排在文字裡會跳出來。

## 四把尺

品質建議體系有四把尺。前兩把只做**視覺參照**（畫布 guide），後兩把才進**離群評分**。這個分工是用優質商業字體校正後定下的（見「用優質字體校正」一節）。

### 固定尺字組（僅供畫布 guide，不進評分）

固定尺字組是我們從報告案例中人工挑出的參照字。它們用來描述「這套字自己如何處理典型外框」，畫在畫布上供設計師目視對照。

目前的字組定義在 `structureRuler.ts`：

- `enclosure`：四面框架字，如 `口 日 目 田 回 因 固 国 國 圖 圆 圓 圍 園 圜`。
- `horizontal-frame`：左右框架字，如 `日 目 自 白 由 甲 申 冒 昌 晶 胄 胃 吕`。
- `vertical-frame`：上下框架字，如 `一 二 三 正 王 旦 且 亘 亞 量 墨 置`。
- `branching-range`：樹枝外伸字，如 `永 木 米 人 大 天 井 并 兴 羊 美 義`。

建立固定尺時只做精確字元匹配：目前字體裡有這個 Unicode 字，就取它的幾何 sample；沒有就記為 missing。同一字元只取第一個 sample。匹配到的固定尺字少於 6 個時，不建立固定尺，系統退回全字體基準。

固定尺有兩種輸出：

- `ruler.baseline`：把匹配到的固定尺字丟進一般 baseline 流程，得到四邊 framing / branching 的常見範圍。編輯頁畫布分布帶會優先使用它。
- `ruler.groups[].box`：每組字各自取 `xMin/xMax/yMin/yMax` 的 median，得到該組代表外框。這可以支援後續更明確的分層 guide，例如顯示「四面框架字外框」或「上下框架字外框」。

**固定尺不再作為 radar 評分的統計基準。** 校正發現這是最大誤報源：字組只有十幾個高度同質的字，分布極窄（MAD 極小），拿去量任意「幾何上剛好有框架邊」的字時，正常設計差異會被放大成 z 值 10–20 的極端建議；連字組內的字（一、日、胄）也會被組內異質性誤殺，例如「一」的長寬比在 vertical-frame 組內天生就是極端值。優質字體上超過三分之一的字因此被列為可疑。

### 全字體基準

全字體基準回答「這套字目前整體長什麼樣」。它用所有漢字 sample 建立四邊分布：

- 每一邊分開看：left / right / top / bottom。
- 每一邊再依幾何分類分成 framing / branching。
- 對每組 bearing 計算 `count`、`mode`、`p10`、`p90`、`min`、`max`。
- 對左右兩邊都被判定為 framing 的字，另外計算 `lsb - rsb` 的 median，作為左右置中基準。

畫布上的 P10-P90 分布帶就是從這個基準轉出來的。它的優點是適用於任意字；缺點是如果整套字已經系統性偏掉，這把尺也會跟著偏。因此編輯頁會優先使用固定尺 baseline，固定尺不足時才使用全字體 baseline。它同樣只用於視覺參照，不進評分。

### 複雜度同儕尺

不是所有字都應該一樣寬、一樣高或一樣黑。簡單字和複雜字本來就有不同的字面尺度。因此 radar 不拿單字和全體直接比較，而是拿它跟複雜度相近的字比較。

複雜度定義為：

```ts
glyphComplexity = sqrt(inkArea) / unitsPerEm
```

`RadarStrata.windows` 會依複雜度排序後建立重疊滑動視窗：

- 視窗大小 `K = clamp(ceil(N / 3), 40, 150)`。
- 步長 `K / 3`，相鄰視窗約三分之二重疊。
- 每個字評分時找複雜度最近的視窗。
- 字位於排序端點、缺乏真正同儕時，會用 peer-mismatch 折扣收縮 z-score。

這把尺解決的是延伸性問題：例如「冒」可以比「二」更高，但如果同樣複雜度的字都在某個高度範圍內，單一字太高或太低仍值得檢查。

### 參考結構 residual 尺

參考字體尺回答的是「這個 Unicode 字本身，在成熟字體裡通常會相對同儕偏多少」。它不是把 Noto 或任何參考字體當成絕對形狀，也不是要求目前字體長得像參考字體。它只取一個相對值：

```ts
referenceResidual = referenceGlyphFeature - referencePeerMedian
expectedFeature = currentPeerMedian + referenceResidual * confidence
```

也就是說，參考字體只提供「這個字相對同儕的自然偏移」。目前字體自己的整體風格仍由 `currentPeerMedian` 決定。

例如「人」如果在參考資料中比同複雜度字的視覺重心自然低 4% UPM，而目前這套字的同儕重心本來就整體偏低 5% UPM，系統會把「人」的期待重心放在約 -9% UPM。若設計師正在做一套重心偏低的字體，這個設計方向會被同儕尺吸收；「人」不會只因為低於幾何中央就全部被警告。只有當「人」比「目前字體風格 + 參考結構偏移」還要更低時，才會顯示重心偏低的建議。

資料介面是 `RadarReferenceData`。它支援逐字、逐 feature 的 residual，並可用 `confidence` 降低參考字體風格對目前設計的影響。目前支援的 feature：

- 形狀類：`face:widthRatio`、`face:heightRatio`、`face:aspect`、`ink:toFace`、`gap:x`、`gap:y`
- 放置類：`balance:centroidX`、`balance:centroidY`、`bearing:left/right/top/bottom`

邊距 residual 有兩個特殊約定：

- **不分筆畫類型**：radar 的 bearing feature 帶幾何分型後綴（`bearing:left:framing`），但分型會隨畫壞的輪廓共變，參考資料以「邊」為鍵（`bearing:left`），評分時自動對應。
- **以 UPM 正規化儲存**：參考字體與目前字體的 UPM 可能不同，載入評分時乘回目前字體的 `unitsPerEm`。

建置 residual 時，若某字所在複雜度視窗的 cohort 統計樣本不足（少於 20），會退回同視窗不分 cohort 的統計。這很重要：極端字（弓、㓁、部件字形）常落在稀有 cohort，卻正是最需要 residual 的字。

**形狀與放置適用不同的信任規則**（見「Radar 怎麼產生建議」）。校正發現參考字體的形狀決策（哪些字窄、哪些字矮）在成熟字體間高度一致，可以直接平移期待值；但放置決策（部件靠邊還是置中、留白分配）帶有各家排印慣例，單一參考字體不足以定罪——例如 Noto 的「片」右邊距留到 230/1000，兩套優質 TC 字體都只留 56–93。

若某個字或 feature 沒有 reference residual，系統退回複雜度同儕尺。

目前預設資料是 `public/quality-reference/noto-sans-cjk-tc-regular-radar-residuals.json`，由 Noto Sans CJK TC Regular 離線產生。資料檔收錄約三萬個 Noto 漢字 sample，輸出 30,289 個逐字 residual entry，`defaultConfidence` 設為 `0.75`，讓參考字體只提供結構偏移，不會完全覆蓋目前字體自己的風格。重建指令是：

```bash
pnpm data:quality-reference [font-path-or-url] [output-json]
```

不提供參數時，script 會從 Noto CJK upstream 下載 `NotoSansCJKtc-Regular.otf`，並寫回預設 JSON 路徑。Worker 透過 `getDefaultRadarReferenceData()` 載入這份靜態 JSON；載入失敗或資料缺某個字時，品質分析照常進行，只是不使用 reference residual 校正。這維持了文件原本的界線：編輯頁不即時計算整套參考字體，runtime 只讀一份預先算好的相對值。

## 幾何怎麼取樣

品質分析只攤平一次字形幾何，之後所有特徵都從同一份 sample 取得。

流程如下：

1. 主執行緒用 `resolveFontGlyphs(fontData)` 把 store glyph/layer 轉成純資料 `ResolvedFont`。這是唯一能碰 store 的步驟。
2. Worker 執行 `runPopulationAnalysis(resolvedFont)`。
3. `buildFontGeometrySamples` 走訪所有漢字 glyph。
4. 每個 glyph 的 component 遞迴展開，closed path 轉成 polygon。
5. 同一份 polygon 產出：
   - `bounds`：真實外框。
   - `sides`：四邊 framing / branching 分類與 bearing。
   - `ink`：墨量、重心、密度分布。

這樣可以避免結構分析、radar、墨量分析各自攤平一次，尤其大字體不會在主執行緒反覆卡住。

## 四邊怎麼分類

單字四邊的 framing / branching 是從幾何推導，不看字名，也不看固定字組。

`structureMetrics.buildSidesFromPolygons` 的步驟：

1. 取得 glyph 的真實外框 `bounds`。
2. 對每一邊取一條邊界帶，寬度為 `UPM * 0.018`。
3. 收集落在邊界帶內的 polygon 點。
4. 計算這些點沿該邊方向覆蓋了外框邊長的比例，稱為 `coverage`。
5. `coverage >= 0.55` 視為 **框架筆畫**，否則視為 **樹枝筆畫**。

bearing 的座標定義：

- left = `bounds.xMin`
- right = `advance - bounds.xMax`
- top = `bodyBox.top - bounds.yMax`
- bottom = `bounds.yMin - bodyBox.bottom`

這個分類回答的是「這個字的某一邊目前看起來像框架還是樹枝」，不是「這個字語意上屬於哪種結構」。

## 怎麼知道字是哪種外型

目前有三種判斷來源，它們的角色不同：

- **固定尺字組的外型**：人工策展。`enclosure` / `horizontal-frame` / `vertical-frame` / `branching-range` 是根據報告案例選出的參照集合，程式不自動判斷它們應屬於哪一組。
- **單字四邊的筆畫類型**：幾何推導。每個 sample 的 left/right/top/bottom 都會用 edge-band coverage 判定 framing 或 branching。
- **包圍結構語意分類**：radar 會讀 GlyphWiki 組成資料建立 `enclosureCharacters`。若某字語意上是包圍結構，`collectGlyphFeatures` 會把它四側視為 framing 來做 cohort，避免輪廓畫壞時分組也跟著漂移。這只影響 radar 分組，不改寫 `sample.sides` 的幾何結果。

也就是說，固定尺是「已知參照字」（畫布 guide 用），而品質建議是「複雜度同儕統計 + 目前字幾何側邊分類 + 語意結構輔助分組 + 參考結構 residual」。未來若要讓更多字自動進入 ruler group，應該新增一層結構分類器，例如 GlyphWiki/IDS 結構、radical/包圍件、幾何驗證，而不是在 `qualityRadar` 裡硬塞字名規則。

## Radar 怎麼產生建議

`qualityRadar.collectGlyphFeatures` 會把每個 sample 轉成四類特徵：

- **boundary**：四邊 bearing，key 形如 `bearing:left:framing`。同時用對側類型做 cohort，避免左框右枝和左右皆框的字混在一起。
- **proportion**：`face:widthRatio`、`face:heightRatio`、`face:aspect`。依左右／上下框架數分 cohort。
- **ink**：`ink:toFace`、`ink:toEm`、`ink:spreadX`、`ink:spreadY`。
- **balance**：`bearing:symmetryH`、`balance:centroidX`、`balance:centroidY`。

proportion 另含**投影間隙** `gap:x` / `gap:y`：把輪廓線段投影到軸向 bin，取字面內最寬「無墨空帶」相對字面的比例（封閉輪廓在某列有墨，邊界必穿過該列，故無線段跨越＝真空帶）。左右／上下部件被拉開時，外框、邊距、重心可能都不動，只有這個特徵會動——它是整字聚合特徵抓不到的失效模式。州、三這類天生大間隙的字由 reference residual（形狀類，直接平移）吸收。

`bearing:symmetryH`（lsb−rsb 置中檢查）只對語意包圍字或四邊皆框架的字收集。阝部、匚框這類「單側框架、設計上本來就不對稱」的字不適用置中規則，早期版本因此大量誤殺（陋、賾、除）。

每個 feature 的比較基準是**複雜度同儕視窗**（每個 feature/cohort 至少 20 個樣本才成立），若該字有 reference residual，再依特徵類別套用不同的信任規則：

- **形狀類**（`face:*`、`ink:toFace`）：reference 期待值直接取代同儕中位（`basis: 'reference'`）。成熟字體對「哪些字天生窄、天生矮」高度一致，這讓「冑本來就窄」不再被同儕尺誤殺，也能抓到「該窄卻畫成方塊」的字。
- **放置類**（四邊 bearing、`balance:centroid*`）：**兩把尺同向才算異常**——同儕 z 與 reference z 同號時取 |z| 較小者，異號時歸零。單一參考字體的排印慣例（部件置中方式、特定字的留白分配）不足以定罪，天生放置特殊的字也不因偏離同儕被誤殺。

統計使用 robust median / MAD，並針對偏態分布使用 double-MAD：高於 median 與低於 median 各自有尺度。這是因為邊距分布常常不是對稱鐘形分布，單一尺度會高估長尾側、低估短尾側。

尺度另有**感知下限**（scale floor）：母體高度一致時 MAD 會縮到肉眼無法分辨的量級，把毫無視覺意義的差異放大成極端 z 值。邊距下限 1% UPM、置中偏移 1.5% UPM、比例類 1%、長寬比 0.02。低於這些量級的偏差在字身框尺度下難以目視分辨，不產生建議。

peer-mismatch 折扣（字的複雜度離視窗中心越遠，z 越收縮）只適用尺寸類特徵（boundary/proportion/ink）：延伸性讓字面大小、邊距、墨量本來就隨複雜度變動，複雜度不匹配才會讓比較失真。balance 維度不折扣——置中與重心不隨複雜度共變，簡單字也該放對位置，而且畫壞的字複雜度本身常是偏的，折扣會遮蔽它的置中錯誤。

評分規則：

- `|z| > 2` 才列為 reason。
- `|z| >= 2.5` 才計入維度離群。
- 單一 feature 的 `|z|` 封頂為 8，避免極端字以天文數字霸佔排序。
- 同一維度多個 feature 只取最大偏離計分，避免「字面偏小」同時疊加邊距、比例、密度造成重複懲罰。
- `RadarReason.basis` 會標記建議來自 `peers` 或 `reference`，UI 文案會顯示「複雜度相近的字」或「參考結構校正值」。

`radarAdvice.ts` 再把工程向 reason 翻成設計師可讀的語句，例如：

- 左側留白比複雜度相近的字多：將左側筆畫往左延伸或整體左移。
- 以參考結構校正後來看，字面偏窄：將字面寬度拉寬。
- 左右皆框架筆畫的字未視覺置中：依 `lsb - rsb` 差值建議整體平移。

## 用優質字體校正

演算法的門檻與信任規則不是拍腦袋定的，而是用已知高品質的商業字體回歸出來的。校正 harness 在 `test/qualityCheck/radarCalibration.test.ts`，用 opentype.js 把 `test_glyphs/good_quality_font/` 的字體轉成與編輯器相同的 `GlyphGeometrySample`（共用管線在 `openTypeSampling.ts`），走真正的 `computeRadarFromSamples`：

```bash
QUALITY_CALIBRATION=1 pnpm vitest run test/qualityCheck/radarCalibration.test.ts
```

報告輸出 suspect 比例、各 feature/basis 的誤報分布與 top suspects，可另設 `QUALITY_CALIBRATION_REPORT_DIR` 寫檔。字體檔不進版控，CI 自動跳過。

兩個量測目標：

- **誤報率**：優質字體被列為可疑的比例要低。初版演算法（固定尺進評分、無感知下限、symmetryH 全面適用）在兩套優質字體上分別誤報 40.8% 與 59.5%；目前版本為 2.3% 與 1.6%，且殘餘者多為部件字形與真正非典型的字。
- **召回率**：把正常字人工做歪（整體右移 6% UPM、字面縮小 15%、部件間隙拉開至字面 30%），用凍結的 radar 評估（同編輯頁流程），兩套字體的偵測率為 95–100%。

修改評分邏輯時應重跑校正，確認兩個數字沒有回退。

## 編輯頁怎麼使用這把尺

編輯頁 insight 的設計是「凍結的尺量動的筆」：

- `GlyphInsightProvider` 對全字體基準做 2 秒 debounce，丟 worker 計算。這讓正在編輯的筆畫不會每動一下就改變基準。
- 單字 sample 則做 150ms debounce，在主執行緒即時計算。
- `evaluateSampleAgainstRadar` 用凍結的 `radar` 評估目前 sample。
- `CanvasWorkspace` 透過 `buildStructureGuideModel` 把 baseline 轉成 `SceneModel.structureGuide`，由 `src/sceneView/layers/structureGuide.ts` 畫 P10-P90 帶。
- 圖層顯示由 model 欄位存在與否控制，不走 `setLayerVisible`。

這讓設計師可以邊改字邊看到它和設計標準的距離，而不是只能在改完後回 modal 批次檢查。

## 模組分層

品質檢查仍分成三種分析典範，各自獨立：

- **母體統計**：結構 baseline、固定尺、radar，共用一次幾何取樣。
- **文字排版**：proof，檢查字在排版情境中的灰度與節奏。
- **規則檢查**：lint，檢查硬性錯誤，例如空輪廓、advance 異常、bbox 超界。

Worker import graph 不能碰 store：

- `resolvedGlyph.ts` 定義 `ResolvedGlyph` / `ResolvedFont`，並提供唯一使用 `getGlyphLayer` 的 store adapter：`resolveFontGlyphs`。它只在主執行緒使用。
- `populationAnalysis.ts` 只保留已解析字形的純分析；`populationAnalysisAdapter.ts` 才提供 `analyzeFontPopulation(fontData)` 這條主執行緒同步 adapter。Worker 不可 import adapter。
- 可進 worker 的純層包括 `polygonGeometry`、`glyphInk`、`hanClassification`、`structureMetrics`、`structureRuler`、`glyphSampling`、`qualityRadar`、`populationAnalysis`，以及只用 `fetch` 載靜態資料的 `semanticStructure` / `radarReferenceData`。`openTypeSampling` 是給校正 harness 與參考資料建置用的 opentype.js 轉接層，同樣是純函數。
- `src/workers/qualityAnalysisWorker.ts` import `runPopulationAnalysis`、GlyphWiki enclosure loader 與 Noto residual loader。若 store 洩漏進 worker，build 後 chunk 會從十幾 KB 膨脹到數百 KB，可當回歸檢測。
- `useQualityAnalysis.ts` 負責 worker hook；`isAnalyzing` 由「最後分析的 fontData 是否等於當前 fontData」衍生，不在 effect 裡同步 `setState`。
- 字形幾何是 lazy-load 的（總覽頁瀏覽到才進 store，且有 LRU 驅逐），品質分析不能只拿「剛好已載入」的字：`useQualityAnalysis` 在解析階段直接從 IndexedDB 補齊缺幾何的字形（`resolveFontGlyphsComplete`），存模組層快取、不進 store，以 `glyphEditTimes` 判斷失效；已編輯的字以 store 版本為準。UI 端的輪廓預覽同理由 `usePreviewGlyphMap` 補齊。

新增母體分析特徵時，應加在 `glyphSampling` 的 sample 或 `qualityRadar.collectGlyphFeatures`，不要另開一條 flatten 流程。任何要進 worker 的程式碼只能 `import type` 自 `resolvedGlyph`，不能 import `resolveFontGlyphs`。
