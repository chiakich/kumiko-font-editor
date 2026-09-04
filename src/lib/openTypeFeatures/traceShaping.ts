import { createHarfBuzzRuntimeStatus } from '@/lib/openTypeFeatures/harfbuzzRuntimeCapabilities'
import type {
  HarfBuzzTraceEntry,
  HarfBuzzTraceGlyph,
} from '@/lib/openTypeFeatures/harfbuzzRuntime'
import type {
  HarfBuzzRuntimeStatus,
  ShapeTextOptions,
} from '@/lib/openTypeFeatures/harfbuzzTypes'

export interface ShapingTraceStep {
  featureTag: string
  lookupIndex: number
  phase: 'GSUB' | 'GPOS'
  // Source clusters this lookup changed.
  clusters: number[]
  // Glyph names at those clusters before/after (GPOS keeps names, moves them).
  beforeNames: string[]
  afterNames: string[]
  // Whether the change was positioning rather than substitution.
  positional: boolean
}

export interface ShapeTraceResult {
  ok: boolean
  message?: string
  steps: ShapingTraceStep[]
  runtimeStatus: HarfBuzzRuntimeStatus
}

const LOOKUP_MESSAGE = /^(start|end) lookup (\d+) feature '([^']+)'/

// Per-cluster fingerprint of a snapshot: glyph ids (and positions when the
// snapshot carries them) grouped by cluster.
const byCluster = (snapshot: readonly HarfBuzzTraceGlyph[]) => {
  const clusters = new Map<number, string[]>()
  for (const glyph of snapshot) {
    const entry = clusters.get(glyph.cl) ?? []
    entry.push(
      `${glyph.g}:${glyph.dx ?? 0}:${glyph.dy ?? 0}:${glyph.ax ?? 0}:${glyph.ay ?? 0}`
    )
    clusters.set(glyph.cl, entry)
  }
  return clusters
}

const changedClusters = (
  before: readonly HarfBuzzTraceGlyph[],
  after: readonly HarfBuzzTraceGlyph[]
) => {
  const beforeMap = byCluster(before)
  const afterMap = byCluster(after)
  const changed: number[] = []
  for (const cluster of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    if (
      (beforeMap.get(cluster) ?? []).join('|') !==
      (afterMap.get(cluster) ?? []).join('|')
    ) {
      changed.push(cluster)
    }
  }
  return changed.sort((left, right) => left - right)
}

const glyphIdsAt = (
  snapshot: readonly HarfBuzzTraceGlyph[],
  clusters: ReadonlySet<number>
) => snapshot.filter((glyph) => clusters.has(glyph.cl)).map((glyph) => glyph.g)

// Traces one shaped run: which lookup of which feature changed which source
// clusters. Heavier than plain shaping (HarfBuzz serializes the buffer at
// every message), so callers run it on demand, not per keystroke.
export const traceTextShaping = async (
  fontBuffer: ArrayBuffer,
  text: string,
  options: ShapeTextOptions = {}
): Promise<ShapeTraceResult> => {
  if (!fontBuffer.byteLength || !text) {
    return {
      ok: false,
      message: 'Nothing to trace.',
      steps: [],
      runtimeStatus: createHarfBuzzRuntimeStatus(false),
    }
  }
  try {
    const { loadHarfBuzzRuntime } =
      await import('@/lib/openTypeFeatures/harfbuzzRuntime')
    const hb = await loadHarfBuzzRuntime()
    const blob = hb.createBlob(fontBuffer)
    try {
      const face = hb.createFace(blob, 0)
      try {
        const font = hb.createFont(face)
        try {
          const buffer = hb.createBuffer()
          try {
            buffer.addText(text)
            if (options.direction) buffer.setDirection(options.direction)
            if (options.language) buffer.setLanguage(options.language)
            if (options.script) buffer.setScript(options.script)
            buffer.guessSegmentProperties()
            const entries = hb.shapeWithTrace(
              font,
              buffer,
              options.features
                ?.map((feature) => feature.trim())
                .filter(Boolean)
                .join(','),
              -1,
              0
            )
            return {
              ok: true,
              steps: collectSteps(entries, (glyphId) =>
                font.glyphName(glyphId)
              ),
              runtimeStatus: createHarfBuzzRuntimeStatus(),
            }
          } finally {
            buffer.destroy()
          }
        } finally {
          font.destroy()
        }
      } finally {
        face.destroy()
      }
    } finally {
      blob.destroy()
    }
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : 'HarfBuzz trace failed.',
      steps: [],
      runtimeStatus: createHarfBuzzRuntimeStatus(false),
    }
  }
}

const collectSteps = (
  entries: readonly HarfBuzzTraceEntry[],
  nameFor: (glyphId: number) => string
): ShapingTraceStep[] => {
  const steps: ShapingTraceStep[] = []
  let phase: 'GSUB' | 'GPOS' | null = null
  // start-lookup snapshots by "lookupIndex:featureTag".
  const pending = new Map<string, HarfBuzzTraceGlyph[]>()

  for (const entry of entries) {
    if (entry.m.startsWith('start table GSUB')) {
      phase = 'GSUB'
      continue
    }
    if (entry.m.startsWith('start table GPOS')) {
      phase = 'GPOS'
      continue
    }
    if (!phase || !entry.glyphs) {
      continue
    }
    const match = LOOKUP_MESSAGE.exec(entry.m)
    if (!match) {
      continue
    }
    const [, edge, lookupText, featureTag] = match
    const key = `${phase}:${lookupText}:${featureTag}`
    if (edge === 'start') {
      pending.set(key, entry.t)
      continue
    }
    const before = pending.get(key)
    pending.delete(key)
    if (!before) {
      continue
    }
    const clusters = changedClusters(before, entry.t)
    if (clusters.length === 0) {
      continue
    }
    const clusterSet = new Set(clusters)
    const beforeIds = glyphIdsAt(before, clusterSet)
    const afterIds = glyphIdsAt(entry.t, clusterSet)
    steps.push({
      featureTag,
      lookupIndex: Number(lookupText),
      phase,
      clusters,
      beforeNames: beforeIds.map(nameFor),
      afterNames: afterIds.map(nameFor),
      positional:
        phase === 'GPOS' || beforeIds.join(',') === afterIds.join(','),
    })
  }
  return steps
}
