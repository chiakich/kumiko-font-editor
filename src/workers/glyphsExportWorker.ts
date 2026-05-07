/// <reference lib="webworker" />

import { exportGlyphsByPatchingText } from 'src/lib/glyphsPatchExport'
import { loadProjectDraft } from 'src/lib/projectRepository'
import type { GlyphData } from 'src/store'

interface ExportRequestMessage {
  type: 'export-glyphs'
  payload: {
    projectId: string
    dirtyGlyphs: Record<string, GlyphData>
  }
}

interface ExportSuccessMessage {
  type: 'export-success'
  payload: {
    blob: Blob
  }
}

interface ExportErrorMessage {
  type: 'export-error'
  payload: {
    message: string
  }
}

type ExportResponseMessage = ExportSuccessMessage | ExportErrorMessage

self.onmessage = async (event: MessageEvent<ExportRequestMessage>) => {
  if (event.data?.type !== 'export-glyphs') {
    return
  }

  try {
    const persistedProject = await loadProjectDraft(
      event.data.payload.projectId
    )
    if (!persistedProject?.projectGlyphsText) {
      throw new Error('Project text source not found for export')
    }
    const blob = await exportGlyphsByPatchingText({
      rawText: persistedProject.projectGlyphsText,
      dirtyGlyphs: event.data.payload.dirtyGlyphs,
    })
    const message: ExportResponseMessage = {
      type: 'export-success',
      payload: { blob },
    }
    self.postMessage(message)
  } catch (error) {
    const message: ExportResponseMessage = {
      type: 'export-error',
      payload: {
        message:
          error instanceof Error ? error.message : 'Unknown export error',
      },
    }
    self.postMessage(message)
  }
}

export {}
