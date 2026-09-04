import { useEffect, useMemo, useState } from 'react'
import {
  shapeTextWithHarfBuzz,
  type OpenTypeFeaturesState,
} from '@/lib/openTypeFeatures'
import type { FontData } from '@/domain'
import { getShapingPreviewFontBuffer } from '@/features/common/projectControl/fontSettings/features/utils/shapingPreviewFont'
import {
  buildDisabledFeatureList,
  listPreviewFeatureToggles,
} from '@/features/common/projectControl/fontSettings/features/utils/shapingPreviewModel'
import { buildFeatureSpecimenGlyphs } from '@/features/common/projectControl/fontSettings/features/utils/featureSpecimen'
import { PREVIEW_GLYPH_PLACEHOLDER } from '@/features/common/projectControl/fontSettings/features/utils/shapingPreviewTokens'
import type { ShapingPreviewRun } from '@/features/common/projectControl/fontSettings/features/hooks/useShapingPreview'

// First kerning pair whose two sides resolve to real glyphs.
const sampleProjectKerningPair = (fontData: FontData): string[] => {
  const groups = fontData.kerningGroups ?? []
  const resolve = (selector: {
    kind: 'glyph' | 'class'
    glyph?: string
    classId?: string
  }): string | null => {
    if (selector.kind === 'glyph') {
      return selector.glyph && fontData.glyphs[selector.glyph]
        ? selector.glyph
        : null
    }
    const group = groups.find(
      (candidate) =>
        candidate.id === selector.classId ||
        candidate.name === selector.classId ||
        `@${candidate.name}` === selector.classId
    )
    return group?.glyphs.find((glyphId) => fontData.glyphs[glyphId]) ?? null
  }
  for (const pair of fontData.kerningPairs ?? []) {
    const left = resolve(pair.left)
    const right = resolve(pair.right)
    if (left && right && pair.value !== 0) {
      return [left, right]
    }
  }
  return []
}

export interface FeatureSpecimen {
  before: ShapingPreviewRun
  after: ShapingPreviewRun
  // Whether the feature visibly changed the sample.
  changed: boolean
}

// One before→after sample per feature tag, shaped with only that feature
// enabled so each row demonstrates exactly its own work. Samples are glyph
// tokens (not text), so unencoded glyphs demonstrate fine.
export const useFeatureSpecimens = (input: {
  fontData: FontData | null
  openTypeFeatures: OpenTypeFeaturesState | undefined
  enabled: boolean
}) => {
  const { fontData, openTypeFeatures, enabled } = input
  const [result, setResult] = useState<{
    state: OpenTypeFeaturesState | undefined
    byTag: Map<string, FeatureSpecimen>
    error: string | null
  } | null>(null)

  const samples = useMemo(() => {
    if (!openTypeFeatures) {
      return []
    }
    const hasProjectKerning = (fontData?.kerningPairs?.length ?? 0) > 0
    return listPreviewFeatureToggles(
      openTypeFeatures,
      'ltr',
      hasProjectKerning ? ['kern'] : []
    ).map((toggle) => {
      let glyphs = buildFeatureSpecimenGlyphs(openTypeFeatures, toggle.tag)
      // Synthesized kern has no IR rules; sample the first project pair.
      if (glyphs.length === 0 && toggle.tag === 'kern' && fontData) {
        glyphs = sampleProjectKerningPair(fontData)
      }
      return { tag: toggle.tag, glyphs }
    })
  }, [openTypeFeatures, fontData])

  useEffect(() => {
    if (!enabled || !fontData || !openTypeFeatures) {
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const buffer = await getShapingPreviewFontBuffer(
          fontData,
          openTypeFeatures
        )
        const allOff = buildDisabledFeatureList(
          listPreviewFeatureToggles(openTypeFeatures)
        )
        const byTag = new Map<string, FeatureSpecimen>()
        for (const sample of samples) {
          if (cancelled) {
            return
          }
          if (sample.glyphs.length === 0) {
            continue
          }
          // Encoded sample glyphs enter as real characters so the feature can
          // actually fire on them; only unencoded ones ride as tokens (which
          // deliberately sit outside substitution — see shapingPreviewTokens).
          let text = ''
          const glyphTokens = new Map<number, string>()
          for (const name of sample.glyphs) {
            const unicode = fontData.glyphs[name]?.unicodes?.[0]
            const codePoint = unicode
              ? Number.parseInt(unicode, 16)
              : Number.NaN
            if (Number.isFinite(codePoint)) {
              text += String.fromCodePoint(codePoint)
            } else {
              glyphTokens.set(text.length, name)
              text += PREVIEW_GLYPH_PLACEHOLDER
            }
          }
          const shape = (features: string[]) =>
            shapeTextWithHarfBuzz(buffer, text, {
              features,
              includeGlyphShapes: true,
              glyphTokens,
            })
          const [before, after] = await Promise.all([
            shape(allOff),
            shape([
              ...allOff.filter((entry) => entry !== `-${sample.tag}`),
              `+${sample.tag}`,
            ]),
          ])
          if (!before.ok || !after.ok) {
            continue
          }
          const unitsPerEm = after.unitsPerEm ?? 1000
          byTag.set(sample.tag, {
            before: { glyphs: before.glyphs, unitsPerEm },
            after: { glyphs: after.glyphs, unitsPerEm },
            changed:
              JSON.stringify(
                before.glyphs.map((g) => [
                  g.glyphId,
                  g.xAdvance,
                  g.xOffset,
                  g.yOffset,
                ])
              ) !==
              JSON.stringify(
                after.glyphs.map((g) => [
                  g.glyphId,
                  g.xAdvance,
                  g.xOffset,
                  g.yOffset,
                ])
              ),
          })
        }
        if (!cancelled) {
          setResult({ state: openTypeFeatures, byTag, error: null })
        }
      } catch (error) {
        if (!cancelled) {
          setResult({
            state: openTypeFeatures,
            byTag: new Map(),
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [enabled, fontData, openTypeFeatures, samples])

  const current = result && result.state === openTypeFeatures ? result : null
  return {
    byTag: current?.byTag ?? null,
    error: current?.error ?? null,
    isLoading: enabled && !current,
  }
}
