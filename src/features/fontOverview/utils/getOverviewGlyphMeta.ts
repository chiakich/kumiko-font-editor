import {
  getGlyphBlockLabel,
  getGlyphScriptLabel,
} from '@/lib/glyph/glyphOverview'
import type { GlyphData } from '@/store'

export const getOverviewGlyphMeta = (glyph: GlyphData) => ({
  script: getGlyphScriptLabel(glyph),
  block: getGlyphBlockLabel(glyph),
})
