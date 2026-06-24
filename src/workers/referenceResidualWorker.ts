/// <reference lib="webworker" />

import opentype from 'opentype.js'
import { buildRadarReferenceDataFromOpenTypeFont } from 'src/lib/qualityCheck/openTypeReferenceResiduals'
import { getEnclosureCharacterSet } from 'src/lib/qualityCheck/semanticStructure'
import type { RadarReferenceData } from 'src/lib/qualityCheck/qualityRadar'

interface BuildReferenceResidualMessage {
  type: 'build-reference-residual'
  payload: {
    requestId: number
    fontName: string
    fontBytes: ArrayBuffer
  }
}

interface ReferenceResidualSuccessMessage {
  type: 'reference-residual-success'
  payload: {
    requestId: number
    referenceData: RadarReferenceData
    sampleCount: number
    entryCount: number
  }
}

interface ReferenceResidualErrorMessage {
  type: 'reference-residual-error'
  payload: {
    requestId: number
    message: string
  }
}

export type ReferenceResidualWorkerResponse =
  | ReferenceResidualSuccessMessage
  | ReferenceResidualErrorMessage

self.onmessage = async (event: MessageEvent<BuildReferenceResidualMessage>) => {
  if (event.data.type !== 'build-reference-residual') {
    return
  }

  const { requestId, fontBytes, fontName } = event.data.payload
  const post = (self as DedicatedWorkerGlobalScope).postMessage.bind(self)

  try {
    const [font, enclosureCharacters] = await Promise.all([
      Promise.resolve(opentype.parse(fontBytes)),
      getEnclosureCharacterSet(),
    ])
    const result = buildRadarReferenceDataFromOpenTypeFont(
      font,
      fontName,
      enclosureCharacters
    )
    post({
      type: 'reference-residual-success',
      payload: {
        requestId,
        referenceData: result.data,
        sampleCount: result.sampleCount,
        entryCount: result.entryCount,
      },
    } satisfies ReferenceResidualSuccessMessage)
  } catch (error) {
    post({
      type: 'reference-residual-error',
      payload: {
        requestId,
        message:
          error instanceof Error
            ? error.message
            : '無法從參考字體建立自動建議資料。',
      },
    } satisfies ReferenceResidualErrorMessage)
  }
}
