import { toStableIdPart } from '@/lib/openTypeFeatures/ids'
import type { FontData } from '@/domain'
import { getGlyphLayer, withActiveLayer } from '@/domain/glyphLayer'
import type {
  AnchorBehaviorDraft,
  AnchorBehaviorRow,
  AnchorBehaviorStatus,
} from '@/lib/openTypeFeatures/behaviorTypes'

export function deriveGlyphAnchorBehaviors(
  fontData: FontData,
  glyphId: string
): AnchorBehaviorRow[] {
  const glyph = fontData.glyphs[glyphId]
  const layer = getGlyphLayer(glyph, null)
  if (!layer) return []

  const anchors = layer.anchors ?? []
  const duplicateNames = countAnchorNames(anchors)
  return anchors.map((anchor) => ({
    id: anchor.id,
    glyphId,
    name: anchor.name,
    x: anchor.x,
    y: anchor.y,
    kind: anchor.name.startsWith('_') ? 'mark' : 'base',
    status: getAnchorStatus(anchor, duplicateNames.get(anchor.name) ?? 0),
  }))
}

export function canCommitAnchorBehavior(draft: AnchorBehaviorDraft) {
  return (
    isValidAnchorName(draft.name.trim()) &&
    Number.isFinite(draft.x) &&
    Number.isFinite(draft.y)
  )
}

export function upsertAnchorBehavior(
  fontData: FontData,
  draft: AnchorBehaviorDraft
): FontData {
  if (!canCommitAnchorBehavior(draft)) return fontData
  const glyph = fontData.glyphs[draft.glyphId]
  const layer = getGlyphLayer(glyph, null)
  if (!glyph || !layer) return fontData

  const anchor = {
    id: draft.id ?? makeAnchorId(draft.glyphId, draft.name),
    name: draft.name.trim(),
    x: Math.round(draft.x),
    y: Math.round(draft.y),
  }
  const anchors = layer.anchors ?? []
  const nextAnchors = anchors.some((item) => item.id === anchor.id)
    ? anchors.map((item) => (item.id === anchor.id ? anchor : item))
    : [...anchors, anchor]

  const nextFontData = {
    ...fontData,
    glyphs: {
      ...fontData.glyphs,
      [draft.glyphId]: withActiveLayer(glyph, { anchors: nextAnchors }),
    },
  }

  return syncOpenTypeAnchorDefinitions(nextFontData, draft.glyphId)
}

export function deleteAnchorBehavior(
  fontData: FontData,
  glyphId: string,
  anchorId: string
): FontData {
  const glyph = fontData.glyphs[glyphId]
  const layer = getGlyphLayer(glyph, null)
  if (!glyph || !layer) return fontData

  const nextFontData = {
    ...fontData,
    glyphs: {
      ...fontData.glyphs,
      [glyphId]: withActiveLayer(glyph, {
        anchors: (layer.anchors ?? []).filter(
          (anchor) => anchor.id !== anchorId
        ),
      }),
    },
  }

  return syncOpenTypeAnchorDefinitions(nextFontData, glyphId)
}

function countAnchorNames(anchors: Array<{ name: string }>) {
  const counts = new Map<string, number>()
  for (const anchor of anchors) {
    counts.set(anchor.name, (counts.get(anchor.name) ?? 0) + 1)
  }
  return counts
}

function getAnchorStatus(
  anchor: { name: string; x: number; y: number },
  duplicateCount: number
): AnchorBehaviorStatus[] {
  const status: AnchorBehaviorStatus[] = []
  if (
    !isValidAnchorName(anchor.name) ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y)
  ) {
    status.push('Invalid Input')
  }
  if (duplicateCount > 1) {
    status.push('Duplicate')
  }
  return status
}

function isValidAnchorName(name: string) {
  return /^_?[A-Za-z][A-Za-z0-9_.-]*$/.test(name)
}

function makeAnchorId(glyphId: string, name: string) {
  return `anchor_${toStableIdPart(glyphId)}_${toStableIdPart(name)}_${Date.now()}`
}

function syncOpenTypeAnchorDefinitions(fontData: FontData, glyphId: string) {
  const openTypeFeatures = fontData.openTypeFeatures
  if (!openTypeFeatures) return fontData

  const glyph = fontData.glyphs[glyphId]
  const layer = getGlyphLayer(glyph, null)
  return {
    ...fontData,
    openTypeFeatures: {
      ...openTypeFeatures,
      anchors: [
        ...openTypeFeatures.anchors.filter(
          (anchor) => anchor.glyph !== glyphId
        ),
        ...((layer?.anchors ?? []).map((anchor) => ({
          id: anchor.id,
          glyph: glyphId,
          name: anchor.name,
          x: anchor.x,
          y: anchor.y,
        })) ?? []),
      ],
    },
  }
}
