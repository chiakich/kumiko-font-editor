# Glyph 命名與名稱對應

glyph 名稱對應採 Glyphs 的 `GlyphData.xml`（[schriftgestalt/GlyphsInfo](https://github.com/schriftgestalt/GlyphsInfo)，`Glyphs3` 分支，BSD 3-Clause）為權威來源。

## 為什麼

在 Glyphs 3 的命名體系裡，**glyph 的身分是「名字」，Unicode 是從名字查出來的衍生屬性**。每個 glyph 有兩種名字：

|                     | 給誰看       | 範例        | 用途                                                  |
| ------------------- | ------------ | ----------- | ----------------------------------------------------- |
| **nice name**       | 人（設計師） | `leftArrow` | UI 顯示、glyph 清單、複製出來就是這個                 |
| **production name** | 字檔 / 程式  | `arrowleft` | 寫進匯出字檔的 `post` 表，須 ASCII 且能反推回 Unicode |

jf 等字集清單是從 Glyphs 3 複製出來的，用的是 **nice name**。舊的 AGL（Adobe Glyph List）只收 production 那套全小寫名，拿 AGL 對應表查 `leftArrow` 會查無此名而**掉字**。要貼近 Glyphs（新的業界標準），必須用 `GlyphData.xml`，它同時帶 nice name、altNames、Unicode 與 production name。

**沒有 Unicode 不是錯誤**：小型大寫、`.vert` 直排變體、連字、stylistic set 等本來就無碼位，在 Glyphs 裡靠 OpenType feature（GSUB）取用，不進 `cmap`。這類 glyph 的 `unicode` 留 `null` 是正確的。

**CJK 漢字不在 `GlyphData.xml` 內**：幾萬個漢字不進資料庫，靠 `uniXXXX ↔ 碼位` 演算法解析。資料庫只收無法用公式推導的具名 glyph（拉丁、符號、標點、假名、記號…約 3.4 萬條）。

## 管線

`scripts/build-glyphdata.mjs`（沒給路徑時自動從上游下載）→ `public/glyphsdata/glyphdata.txt`：

- TSV 格式：`name\tunicode\tproduction\taltNames`
- 全 33,910 條，含無 Unicode 者（連字／變體，供匯出 production name 用）
- ~958KB / gzip ~320KB
- 用 `pnpm data:glyphdata` 執行

## Runtime 解析

- `src/lib/glyphNameInfo.ts`：promise-cache fetch（比照 [CJK 組字策略](cjk-component-strategy.md) 的 glyphwiki loader），`getGlyphNameInfoMap()` 回 `Map<name|altName, { unicode, production }>`。
- `src/features/fontOverview/glyphInput.ts` 的 `resolveGlyphInfo`：`uniXXXX` / 單字元走 regex（不需查表），其餘查 map。candidate 帶 `production`，`addGlyphs` 寫入 `GlyphData.production`。

## 同步約定

**GlyphsInfo 上游不定期更新（約數月一次），需手動重跑 `pnpm data:glyphdata` 同步**，無自動化。

## 待辦

匯出端（UFO 的 `public.postscriptNames`、OTF `post` 表、cmap）尚未全面改用 `production`；`src/lib/glyphsExport.ts` 已讀 `glyph.production`。
