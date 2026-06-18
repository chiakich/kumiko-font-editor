import {
  loadKumikoUiValue,
  saveKumikoUiValue,
} from 'src/lib/project/kumikoProjectPersistence'

export interface ReferenceFontRecord {
  projectId: string
  fontName: string
  fontBytes: ArrayBuffer
}

const REFERENCE_FONT_UI_KEY = 'referenceFont'

export const saveReferenceFont = async (
  projectId: string,
  fontName: string,
  fontBytes: ArrayBuffer
) => {
  await saveKumikoUiValue(projectId, REFERENCE_FONT_UI_KEY, {
    projectId,
    fontName,
    fontBytes,
  } satisfies ReferenceFontRecord)
}

export const loadReferenceFontRecord = async (projectId: string) =>
  loadKumikoUiValue<ReferenceFontRecord>(projectId, REFERENCE_FONT_UI_KEY)

export const deleteReferenceFont = async (projectId: string) => {
  await saveKumikoUiValue(projectId, REFERENCE_FONT_UI_KEY, null)
}
