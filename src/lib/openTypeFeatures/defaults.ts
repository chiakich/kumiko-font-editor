import { hashString } from 'src/lib/hash'
import type {
  AutoFeatureConfig,
  FontFingerprint,
  GlyphNamingConvention,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures/types'
import type { FontData } from 'src/store/types'

export const OPEN_TYPE_FEATURES_IR_VERSION = '1'

export const DEFAULT_SUFFIX_FEATURE_MAP = {
  '.liga': 'liga',
  '.dlig': 'dlig',
  '.rlig': 'rlig',
  '.hlig': 'hlig',
  '.salt': 'salt',
  '.ss01': 'ss01',
  '.ss02': 'ss02',
  '.ss03': 'ss03',
  '.ss04': 'ss04',
  '.ss05': 'ss05',
  '.ss06': 'ss06',
  '.ss07': 'ss07',
  '.ss08': 'ss08',
  '.ss09': 'ss09',
  '.ss10': 'ss10',
  '.ss11': 'ss11',
  '.ss12': 'ss12',
  '.ss13': 'ss13',
  '.ss14': 'ss14',
  '.ss15': 'ss15',
  '.ss16': 'ss16',
  '.ss17': 'ss17',
  '.ss18': 'ss18',
  '.ss19': 'ss19',
  '.ss20': 'ss20',
  '.sc': 'smallCaps',
  '.osf': 'onum',
  '.lf': 'lnum',
  '.tf': 'tnum',
  '.pnum': 'pnum',
  '.sups': 'sups',
  '.subs': 'subs',
  '.ordn': 'ordn',
} satisfies Record<string, string>

export const DEFAULT_AUTO_FEATURE_CONFIG: AutoFeatureConfig = {
  enabled: true,
  liga: true,
  dlig: true,
  rlig: true,
  hlig: true,
  locl: true,
  salt: true,
  stylisticSets: true,
  smcp: true,
  c2sc: true,
  onum: true,
  lnum: true,
  pnum: true,
  tnum: true,
  sups: true,
  subs: true,
  ordn: true,
  frac: false,
  kern: true,
  mark: true,
  mkmk: true,
}

export const DEFAULT_GLYPH_NAMING_CONVENTION: GlyphNamingConvention = {
  ligatureSeparator: '_',
  suffixFeatureMap: DEFAULT_SUFFIX_FEATURE_MAP,
  localizedSuffixPattern: 'loclXXX',
}

export const createEmptyOpenTypeFeaturesState = (
  fontFingerprint: FontFingerprint | null = null
): OpenTypeFeaturesState => ({
  irVersion: OPEN_TYPE_FEATURES_IR_VERSION,
  fontFingerprint,
  languagesystems: [
    {
      id: 'languagesystem_DFLT_dflt',
      script: 'DFLT',
      language: 'dflt',
    },
  ],
  features: [],
  lookups: [],
  glyphClasses: [],
  markClasses: [],
  anchors: [],
  gdef: null,
  unsupportedLookups: [],
  autoFeatureConfig: DEFAULT_AUTO_FEATURE_CONFIG,
  ignoredSuggestionIds: [],
  exportPolicy: 'rebuild-managed-layout-tables',
  diagnostics: [],
})

export const getGlyphOrder = (fontData: FontData) =>
  fontData.glyphOrder?.length
    ? fontData.glyphOrder
    : Object.keys(fontData.glyphs)

export const createFontFingerprint = (fontData: FontData): FontFingerprint => {
  const glyphOrder = getGlyphOrder(fontData)
  const cmapEntries = glyphOrder
    .map((glyphId) => {
      const glyph = fontData.glyphs[glyphId]
      return `${glyphId}:${glyph?.unicode ?? ''}:${glyph?.name ?? ''}`
    })
    .join('|')

  return {
    glyphOrderHash: hashString(glyphOrder.join('|')),
    cmapHash: hashString(cmapEntries),
    unitsPerEm: fontData.unitsPerEm ?? 1000,
    glyphCount: glyphOrder.length,
  }
}

export const ensureOpenTypeFeaturesState = (
  fontData: FontData
): OpenTypeFeaturesState =>
  fontData.openTypeFeatures ?? createEmptyOpenTypeFeaturesState()
