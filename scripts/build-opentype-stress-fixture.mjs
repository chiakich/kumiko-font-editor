import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import opentype from 'opentype.js'
import { loadPyodide } from 'pyodide'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(
  repoRoot,
  'test/fixtures/otf/KumikoOpenTypeStress.otf'
)
const deterministicHeadTimestamp = 2082844800

const rectPath = (x, y, width, height) => {
  const path = new opentype.Path()
  path.moveTo(x, y)
  path.lineTo(x + width, y)
  path.lineTo(x + width, y + height)
  path.lineTo(x, y + height)
  path.close()
  return path
}

const makeGlyph = (name, unicode, advanceWidth = 600) =>
  new opentype.Glyph({
    name,
    unicode,
    advanceWidth,
    path:
      name === '.notdef'
        ? new opentype.Path()
        : rectPath(80, 0, Math.max(advanceWidth - 160, 80), 700),
  })

const glyphs = [
  makeGlyph('.notdef'),
  makeGlyph('A', 0x0041),
  makeGlyph('A.alt'),
  makeGlyph('B', 0x0042),
  makeGlyph('V', 0x0056),
  makeGlyph('f', 0x0066),
  makeGlyph('i', 0x0069),
  makeGlyph('f_i'),
  makeGlyph('less', 0x003c),
  makeGlyph('exclam', 0x0021),
  makeGlyph('hyphen', 0x002d),
  makeGlyph('LIG'),
  makeGlyph('one', 0x0031),
  makeGlyph('two', 0x0032),
  makeGlyph('one.numr'),
  makeGlyph('two.numr'),
  makeGlyph('slash', 0x002f),
  makeGlyph('acutecomb', 0x0301, 0),
  makeGlyph('gravecomb', 0x0300, 0),
]

const baseFont = new opentype.Font({
  familyName: 'Kumiko OpenType Stress',
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs,
})

const featureText = `
languagesystem DFLT dflt;
languagesystem latn dflt;

@Bases = [A A.alt B V f i less exclam hyphen LIG one two one.numr two.numr slash];
@Ligatures = [f_i];
@Marks = [acutecomb gravecomb];
@Digits = [one two];
@Numerators = [one.numr two.numr];

markClass acutecomb <anchor 0 520> @TOP;
markClass gravecomb <anchor 0 520> @TOP;

lookup GSUB_single {
  sub A by A.alt;
} GSUB_single;

lookup GSUB_ligature {
  sub f i by f_i;
} GSUB_ligature;

lookup GSUB_fraction_numerators {
  sub one by one.numr;
  sub two by two.numr;
} GSUB_fraction_numerators;

lookup GSUB_context_helper {
  sub hyphen by LIG;
} GSUB_context_helper;

lookup GSUB_contextual {
  ignore sub less less' exclam hyphen;
  sub LIG LIG hyphen' lookup GSUB_context_helper;
  sub @Bases hyphen' lookup GSUB_context_helper @Bases;
} GSUB_contextual;

lookup GPOS_kern {
  pos A V -80;
  pos @Bases V -20;
} GPOS_kern;

lookup GPOS_context_helper {
  pos V -40;
} GPOS_context_helper;

lookup GPOS_contextual {
  pos A V' lookup GPOS_context_helper;
} GPOS_contextual;

lookup GPOS_mark {
  pos base A <anchor 300 700> mark @TOP;
  pos base B <anchor 310 700> mark @TOP;
} GPOS_mark;

lookup GPOS_mkmk {
  pos mark acutecomb <anchor 0 720> mark @TOP;
} GPOS_mkmk;

lookup GPOS_mark_ligature {
  pos ligature f_i <anchor 200 700> mark @TOP ligComponent <anchor 420 700> mark @TOP;
} GPOS_mark_ligature;

feature aalt {
  lookup GSUB_single;
  lookup GSUB_ligature;
} aalt;

feature salt {
  script latn;
  language dflt;
  lookup GSUB_single;
} salt;

feature liga {
  script latn;
  language dflt;
  lookup GSUB_ligature;
} liga;

feature frac {
  script latn;
  language dflt;
  lookup GSUB_fraction_numerators;
} frac;

feature calt {
  script latn;
  language dflt;
  lookup GSUB_contextual;
} calt;

feature kern {
  script latn;
  language dflt;
  lookup GPOS_kern;
  lookup GPOS_contextual;
} kern;

feature mark {
  script latn;
  language dflt;
  lookup GPOS_mark;
  lookup GPOS_mark_ligature;
} mark;

feature mkmk {
  script latn;
  language dflt;
  lookup GPOS_mkmk;
} mkmk;

table GDEF {
  GlyphClassDef @Bases, @Ligatures, @Marks, ;
  LigatureCaretByPos f_i 250;
} GDEF;
`

const compileFixture = async () => {
  const pyodide = await loadPyodide()
  await pyodide.loadPackage('fonttools')
  pyodide.FS.writeFile(
    '/tmp/base.otf',
    new Uint8Array(baseFont.toArrayBuffer())
  )
  pyodide.FS.writeFile('/tmp/features.fea', featureText)
  pyodide.runPython(`
from fontTools.ttLib import TTFont
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString

font = TTFont("/tmp/base.otf", recalcTimestamp=False)
with open("/tmp/features.fea", "r", encoding="utf-8") as feature_file:
    addOpenTypeFeaturesFromString(font, feature_file.read())
font.recalcTimestamp = False
font["head"].created = ${deterministicHeadTimestamp}
font["head"].modified = ${deterministicHeadTimestamp}
font.save("/tmp/KumikoOpenTypeStress.otf")
`)

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(
    outputPath,
    pyodide.FS.readFile('/tmp/KumikoOpenTypeStress.otf')
  )
}

await compileFixture()
console.log(`Wrote ${outputPath}`)
