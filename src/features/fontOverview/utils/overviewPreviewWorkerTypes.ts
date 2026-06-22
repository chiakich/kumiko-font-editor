import type { GlyphPreviewData } from 'src/lib/glyph/glyphPreviewData'
import type { GlyphData } from 'src/store/types'

export interface OverviewPreviewWorkerRequest {
  cacheKey: string
  glyphId: string
}

export interface BuildOverviewPreviewsPayload {
  activeMasterId: string | null
  glyphs: Record<string, GlyphData>
  requests: OverviewPreviewWorkerRequest[]
  unitsPerEm?: number
}

export interface BuildOverviewPreviewsMessage {
  type: 'build-overview-previews'
  requestId: number
  payload: BuildOverviewPreviewsPayload
}

export interface OverviewPreviewWorkerResult {
  cacheKey: string
  glyphId: string
  preview: GlyphPreviewData | null
}

export interface BuildOverviewPreviewsSuccessMessage {
  type: 'build-overview-previews-success'
  requestId: number
  results: OverviewPreviewWorkerResult[]
}

export interface BuildOverviewPreviewsErrorMessage {
  type: 'build-overview-previews-error'
  requestId: number
  message: string
}

export type OverviewPreviewWorkerIncomingMessage =
  | BuildOverviewPreviewsSuccessMessage
  | BuildOverviewPreviewsErrorMessage
