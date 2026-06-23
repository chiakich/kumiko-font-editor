import { useEffect } from 'react'
import { useToast } from '@chakra-ui/react'
import { sanitizeGlyphEditTimes } from 'src/lib/glyph/glyphEditTimes'
import {
  listExportDirtyKumikoGlyphIds,
  loadKumikoUiValue,
} from 'src/lib/project/kumikoProjectPersistence'
import {
  loadProjectDraftMetadata,
  loadProjectGlyphGeometryClosure,
} from 'src/lib/project/projectRepository'
import {
  canMergeProjectBroadcastWhileDirty,
  projectBroadcastHasCanonicalChanges,
  shouldBlockProjectBroadcastReload,
} from 'src/lib/project/projectBroadcastPolicy'
import { createProjectUiStateSnapshot } from 'src/lib/project/projectUiState'
import { subscribeToProjectBroadcasts } from 'src/lib/project/projectBroadcast'
import { UFO_GLYPH_EDIT_TIMES_KEY } from 'src/lib/glyph/glyphEditTimes'
import { useStore } from 'src/store'

const getOpenGlyphIds = () => {
  const state = useStore.getState()
  return [
    ...new Set(
      [
        state.selectedGlyphId,
        ...state.editorGlyphIds,
        ...state.visibleBackdropLayerIds,
      ].filter((glyphId): glyphId is string => Boolean(glyphId))
    ),
  ]
}

export function useProjectBroadcastSync() {
  const toast = useToast()

  useEffect(
    () =>
      subscribeToProjectBroadcasts((message) => {
        if (message.type !== 'project-draft-saved') {
          return
        }

        const state = useStore.getState()
        if (!state.projectId || state.projectId !== message.projectId) {
          return
        }

        if (shouldBlockProjectBroadcastReload(state, message)) {
          state.setPersistenceStatus(
            'error',
            'This project was updated in another window. Save or reload before continuing.'
          )
          toast({
            title: 'Project updated elsewhere',
            description:
              'Another window saved changes to this project. Finish or reload your local edits before continuing.',
            status: 'warning',
            duration: 5200,
            isClosable: true,
          })
          return
        }
        if (state.isDirty && !projectBroadcastHasCanonicalChanges(message)) {
          return
        }
        if (canMergeProjectBroadcastWhileDirty(state, message)) {
          void (async () => {
            if (message.glyphIds.length > 0) {
              const glyphs = await loadProjectGlyphGeometryClosure(
                message.projectId,
                message.glyphIds
              )
              useStore.getState().hydrateGlyphGeometry(glyphs)
            }
            if (message.deletedGlyphIds.length > 0) {
              useStore
                .getState()
                .hydrateExternalGlyphDeletions(message.deletedGlyphIds)
            }
            toast({
              title: 'Project updated',
              description:
                message.deletedGlyphIds.length > 0
                  ? 'Independent glyph changes and deletions from another window were loaded.'
                  : 'Independent glyph changes from another window were loaded.',
              status: 'info',
              duration: 2400,
              isClosable: true,
            })
          })().catch((error) => {
            useStore
              .getState()
              .setPersistenceStatus(
                'error',
                error instanceof Error
                  ? error.message
                  : 'Unable to merge project updates from another window.'
              )
            console.warn('Project broadcast merge failed.', error)
          })
          return
        }

        const openGlyphIds = getOpenGlyphIds()
        const localUiState = createProjectUiStateSnapshot({
          selectedGlyphId: state.selectedGlyphId,
          selectedLayerId: state.selectedLayerId,
          activeMasterId: state.activeMasterId,
          editLocation: state.editLocation,
          overviewSectionId: state.overviewSectionId,
          overviewTopGlyphId: state.overviewTopGlyphId,
          overviewGridState: state.overviewGridState,
        })
        void (async () => {
          const draft = await loadProjectDraftMetadata(message.projectId)
          if (!draft?.fontData) {
            return
          }

          const current = useStore.getState()
          current.loadProjectState(
            draft.id,
            draft.title,
            draft.fontData,
            draft.projectMetadata ?? null,
            draft.projectSourceFormat ?? null,
            draft.projectRoundTripFormat ?? null,
            localUiState
          )

          const dirtyGlyphIds = await listExportDirtyKumikoGlyphIds(
            message.projectId
          )
          const glyphEditTimes = sanitizeGlyphEditTimes(
            await loadKumikoUiValue(message.projectId, UFO_GLYPH_EDIT_TIMES_KEY)
          )
          useStore
            .getState()
            .hydratePersistedLocalChanges(dirtyGlyphIds, [], glyphEditTimes)

          if (openGlyphIds.length > 0) {
            const glyphs = await loadProjectGlyphGeometryClosure(
              message.projectId,
              openGlyphIds
            )
            useStore.getState().hydrateGlyphGeometry(glyphs)
          }

          toast({
            title: 'Project updated',
            description: 'Changes from another window were loaded.',
            status: 'info',
            duration: 2400,
            isClosable: true,
          })
        })().catch((error) => {
          useStore
            .getState()
            .setPersistenceStatus(
              'error',
              error instanceof Error
                ? error.message
                : 'Unable to load project updates from another window.'
            )
          console.warn('Project broadcast reload failed.', error)
        })
      }),
    [toast]
  )
}
