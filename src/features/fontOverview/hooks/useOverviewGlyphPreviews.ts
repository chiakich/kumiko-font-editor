import { useEffect, useMemo, useRef, useState } from 'react'
import type { GlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import {
  buildGlyphPreviewData,
  type GlyphPreviewData,
} from 'src/lib/glyph/glyphPreviewData'
import type { GlyphData } from 'src/store'
import { createOverviewGlyphPreviewSnapshot } from 'src/features/fontOverview/utils/overviewPreviewSnapshot'
import { buildOverviewGlyphPreviews } from 'src/features/fontOverview/utils/overviewPreviewWorkerClient'
import type {
  OverviewPreviewWorkerRequest,
  OverviewPreviewWorkerResult,
} from 'src/features/fontOverview/utils/overviewPreviewWorkerTypes'

interface CachedOverviewPreview {
  cacheKey: string
  preview: GlyphPreviewData
}

interface UseOverviewGlyphPreviewsOptions {
  activeMasterId: string | null
  glyphEditTimes: GlyphEditTimes
  glyphIds: string[]
  glyphMap: Record<string, GlyphData>
  unitsPerEm?: number
}

const WORKER_FALLBACK_TIMEOUT_MS = 800

const mergeGlyphSnapshots = (
  target: Record<string, GlyphData>,
  source: Record<string, GlyphData>
) => {
  for (const [glyphId, glyph] of Object.entries(source)) {
    target[glyphId] = glyph
  }
}

const buildOverviewGlyphPreviewsSync = ({
  activeMasterId,
  glyphs,
  requests,
  unitsPerEm,
}: {
  activeMasterId: string | null
  glyphs: Record<string, GlyphData>
  requests: OverviewPreviewWorkerRequest[]
  unitsPerEm?: number
}): OverviewPreviewWorkerResult[] =>
  requests.map((request) => {
    const glyph = glyphs[request.glyphId]
    return {
      cacheKey: request.cacheKey,
      glyphId: request.glyphId,
      preview: glyph
        ? buildGlyphPreviewData(glyph, glyphs, unitsPerEm, activeMasterId, {
            dependencyKey: request.cacheKey,
          })
        : null,
    }
  })

export function useOverviewGlyphPreviews({
  activeMasterId,
  glyphEditTimes,
  glyphIds,
  glyphMap,
  unitsPerEm,
}: UseOverviewGlyphPreviewsOptions) {
  const [previewCache, setPreviewCache] = useState<
    Record<string, CachedOverviewPreview>
  >({})
  const previewCacheRef = useRef(previewCache)
  const latestKeysRef = useRef(new Map<string, string>())
  const isMountedRef = useRef(true)
  const pendingKeysRef = useRef(new Map<string, string>())
  const previewRequestModel = useMemo(() => {
    const latestKeys = new Map<string, string>()
    const requests: OverviewPreviewWorkerRequest[] = []
    const glyphsForWorker: Record<string, GlyphData> = {}

    for (const glyphId of new Set(glyphIds)) {
      const snapshot = createOverviewGlyphPreviewSnapshot(
        glyphId,
        glyphMap,
        activeMasterId,
        glyphEditTimes
      )
      if (!snapshot?.isReady) {
        latestKeys.set(glyphId, '')
        continue
      }

      latestKeys.set(glyphId, snapshot.cacheKey)
      requests.push({ cacheKey: snapshot.cacheKey, glyphId })
      mergeGlyphSnapshots(glyphsForWorker, snapshot.glyphs)
    }

    return {
      glyphsForWorker,
      latestKeys,
      requests,
    }
  }, [activeMasterId, glyphEditTimes, glyphIds, glyphMap])

  useEffect(() => {
    previewCacheRef.current = previewCache
  }, [previewCache])

  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    []
  )

  useEffect(() => {
    latestKeysRef.current = previewRequestModel.latestKeys
    if (previewRequestModel.requests.length === 0) {
      return
    }

    const requests: OverviewPreviewWorkerRequest[] = []
    for (const request of previewRequestModel.requests) {
      const cachedPreview = previewCacheRef.current[request.glyphId]
      if (cachedPreview?.cacheKey === request.cacheKey) {
        continue
      }
      if (pendingKeysRef.current.get(request.glyphId) === request.cacheKey) {
        continue
      }

      requests.push(request)
      pendingKeysRef.current.set(request.glyphId, request.cacheKey)
    }

    if (requests.length === 0) {
      return
    }

    let usedSyncFallback = false
    const applySyncFallback = () => {
      if (usedSyncFallback) {
        return
      }
      const stillPendingRequests = requests.filter(
        (request) =>
          pendingKeysRef.current.get(request.glyphId) === request.cacheKey
      )
      if (stillPendingRequests.length === 0) {
        return
      }

      usedSyncFallback = true
      for (const request of stillPendingRequests) {
        pendingKeysRef.current.delete(request.glyphId)
      }
      applyResults(
        buildOverviewGlyphPreviewsSync({
          activeMasterId,
          glyphs: previewRequestModel.glyphsForWorker,
          requests: stillPendingRequests,
          unitsPerEm,
        })
      )
    }

    const applyResults = (results: OverviewPreviewWorkerResult[]) => {
      for (const result of results) {
        if (pendingKeysRef.current.get(result.glyphId) === result.cacheKey) {
          pendingKeysRef.current.delete(result.glyphId)
        }
      }

      if (!isMountedRef.current) {
        return
      }

      setPreviewCache((current) => {
        let didChange = false
        const next = { ...current }
        for (const result of results) {
          if (latestKeysRef.current.get(result.glyphId) !== result.cacheKey) {
            continue
          }
          if (!result.preview) {
            if (next[result.glyphId]) {
              delete next[result.glyphId]
              didChange = true
            }
            continue
          }
          next[result.glyphId] = {
            cacheKey: result.cacheKey,
            preview: result.preview,
          }
          didChange = true
        }
        return didChange ? next : current
      })
    }

    const fallbackTimeout = window.setTimeout(
      applySyncFallback,
      WORKER_FALLBACK_TIMEOUT_MS
    )

    void buildOverviewGlyphPreviews({
      activeMasterId,
      glyphs: previewRequestModel.glyphsForWorker,
      requests,
      unitsPerEm,
    })
      .then((results) => {
        window.clearTimeout(fallbackTimeout)
        applyResults(results)
      })
      .catch((error) => {
        window.clearTimeout(fallbackTimeout)
        console.warn('Overview preview worker failed.', error)
        applySyncFallback()
      })
  }, [activeMasterId, previewRequestModel, unitsPerEm])

  return useMemo(() => {
    const previews: Record<string, GlyphPreviewData> = {}
    for (const [glyphId, cachedPreview] of Object.entries(previewCache)) {
      if (
        previewRequestModel.latestKeys.get(glyphId) !== cachedPreview.cacheKey
      ) {
        continue
      }
      previews[glyphId] = cachedPreview.preview
    }
    return previews
  }, [previewCache, previewRequestModel])
}
