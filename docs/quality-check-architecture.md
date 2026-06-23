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

## 三把尺

品質建議同時使用三把尺。它們各自回答不同問題。

### 固定尺字組

固定尺字組是我們從報告案例中人工挑出的參照字。它們用來描述「這套字自己如何處理典型外框」，比全字體平均更穩定。

目前的字組定義在 `structureRuler.ts`：

- `enclosure`：四面框架字，如 `口 日 目 田 回 因 固 国 國 圖 圆 圓 圍 園 圜`。
- `horizontal-frame`：左右框架字，如 `日 目 自 白 由 甲 申 冒 昌 晶 胄 胃 吕`。
- `vertical-frame`：上下框架字，如 `一 二 三 正 王 旦 且 亘 亞 量 墨 置`。
- `branching-range`：樹枝外伸字，如 `永 木 米 人 大 天 井 并 兴 羊 美 義`。

建立固定尺時只做精確字元匹配：目前字體裡有這個 Unicode 字，就取它的幾何 sample；沒有就記為 missing。同一字元只取第一個 sample。匹配到的固定尺字少於 6 個時，不建立固定尺，系統退回全字體基準。

固定尺有兩種輸出：

- `ruler.baseline`：把匹配到的固定尺字丟進一般 baseline 流程，得到四邊 framing / branching 的常見範圍。編輯頁畫布分布帶會優先使用它。
- `ruler.groups[].box`：每組字各自取 `xMin/xMax/yMin/yMax` 的 median，得到該組代表外框。這可以支援後續更明確的分層 guide，例如顯示「四面框架字外框」或「上下框架字外框」。

固定尺的重點不是覆蓋所有字，而是提供一組不容易隨全體母體漂移的設計參照。

### 全字體基準

全字體基準回答「這套字目前整體長什麼樣」。它用所有漢字 sample 建立四邊分布：

- 每一邊分開看：left / right / top / bottom。
- 每一邊再依幾何分類分成 framing / branching。
- 對每組 bearing 計算 `count`、`mode`、`p10`、`p90`、`min`、`max`。
- 對左右兩邊都被判定為 framing 的字，另外計算 `lsb - rsb` 的 median，作為左右置中基準。

畫布上的 P10-P90 分布帶就是從這個基準轉出來的。它的優點是適用於任意字；缺點是如果整套字已經系統性偏掉，這把尺也會跟著偏。因此編輯頁會優先使用固定尺 baseline，固定尺不足時才使用全字體 baseline。

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

也就是說，固定尺是「已知參照字」，而品質建議是「固定參照字統計 + 目前字幾何側邊分類 + 語意結構輔助分組」。未來若要讓更多字自動進入 ruler group，應該新增一層結構分類器，例如 GlyphWiki/IDS 結構、radical/包圍件、幾何驗證，而不是在 `qualityRadar` 裡硬塞字名規則。

## Radar 怎麼產生建議

`qualityRadar.collectGlyphFeatures` 會把每個 sample 轉成四類特徵：

- **boundary**：四邊 bearing，key 形如 `bearing:left:framing`。同時用對側類型做 cohort，避免左框右枝和左右皆框的字混在一起。
- **proportion**：`face:widthRatio`、`face:heightRatio`、`face:aspect`。依左右／上下框架數分 cohort。
- **ink**：`ink:toFace`、`ink:toEm`、`ink:spreadX`、`ink:spreadY`。
- **balance**：`bearing:symmetryH`、`balance:centroidX`、`balance:centroidY`。

每個 feature 會先找可用的比較尺：

- boundary 和 `face:*` 若有固定尺統計，優先使用 `rulerStatsByKey`，且每個 feature/cohort 至少 5 個樣本才成立。
- 沒有固定尺統計時，使用複雜度同儕視窗，且每個 feature/cohort 至少 20 個樣本才成立。
- 墨量、密度、重心永遠使用複雜度同儕視窗。

統計使用 robust median / MAD，並針對偏態分布使用 double-MAD：高於 median 與低於 median 各自有尺度。這是因為邊距分布常常不是對稱鐘形分布，單一尺度會高估長尾側、低估短尾側。

評分規則：

- `|z| > 2` 才列為 reason。
- `|z| >= 2.5` 才計入維度離群。
- 單一 feature 的 `|z|` 封頂為 8，避免極端字以天文數字霸佔排序。
- 同一維度多個 feature 只取最大偏離計分，避免「字面偏小」同時疊加邊距、比例、密度造成重複懲罰。
- `RadarReason.basis` 會標記建議來自 `ruler` 或 `peers`，UI 文案會顯示「固定尺字組」或「複雜度相近的字」。

`radarAdvice.ts` 再把工程向 reason 翻成設計師可讀的語句，例如：

- 左側留白比固定尺字組多：將左側筆畫往左延伸或整體左移。
- 字面比複雜度相近的字偏窄：將字面寬度拉寬。
- 左右皆框架筆畫的字未視覺置中：依 `lsb - rsb` 差值建議整體平移。

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
- 可進 worker 的純層包括 `polygonGeometry`、`glyphInk`、`hanClassification`、`structureMetrics`、`structureRuler`、`glyphSampling`、`qualityRadar`、`populationAnalysis`。
- `src/workers/qualityAnalysisWorker.ts` 只 import `runPopulationAnalysis`。若 store 洩漏進 worker，build 後 chunk 會從約 9KB 膨脹到數百 KB，可當回歸檢測。
- `useQualityAnalysis.ts` 負責 worker hook；`isAnalyzing` 由「最後分析的 fontData 是否等於當前 fontData」衍生，不在 effect 裡同步 `setState`。

新增母體分析特徵時，應加在 `glyphSampling` 的 sample 或 `qualityRadar.collectGlyphFeatures`，不要另開一條 flatten 流程。任何要進 worker 的程式碼只能 `import type` 自 `resolvedGlyph`，不能 import `resolveFontGlyphs`。
