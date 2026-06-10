========================================================================
Third-Party Software Licenses
========================================================================
This project contains code from the following open-source projects:

1. [漢字部件檢索](https://github.com/ButTaiwan/hanseeker)

- 程式碼、HTML部分
  比照 WFG 「部件檢索」原始的授權規定：無條件提供授權給一切非商業營利，有助於學術研究、有益於教育學習、有利於閱讀大眾的網站或個人使用。
- 拆分資料的來源由 WFG 整理自以下來源，依各授權規定聲明著作權資訊於此：
  中央研究院「漢字構形資料庫」 - GPL3授權 (https://cdp.sinica.edu.tw/cdphanzi/)
  漢字データベース「字形ＩＤＳデータ」 - GPL授權 (http://kanji-database.sourceforge.net/ids/ids.html)
- 字型檔部分(PUAExt-Regular)
  萃取自 WFG 的全宋體。其字型主要收錄自全字庫宋體等。適用政府資料開放授權條款－第1版。

2. [GlyphWiki](https://glyphwiki.org/)

`public/glyphwiki/composition.txt` is derived from the GlyphWiki dump
(`https://glyphwiki.org/dump.tar.gz`) by `scripts/build-glyphwiki-data.mjs`.
Per the GlyphWiki license, the data may be freely used, modified, and
redistributed by anyone, including commercial use, with no attribution
required (https://glyphwiki.org/wiki/GlyphWiki:License).

3. [BabelStone IDS Database](https://www.babelstone.co.uk/CJK/IDS.HTML)

`public/ids/ids_babelstone.txt` is derived from IDS.TXT maintained by
Andrew West (BabelStone), converted by `scripts/build-ids-data.mjs`.
The author states that the IDS data is a collection of facts not eligible
for copyright protection, and explicitly permits unrestricted personal and
commercial use.
