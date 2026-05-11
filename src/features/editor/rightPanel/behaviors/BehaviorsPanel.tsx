import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  Stack,
  useDisclosure,
} from '@chakra-ui/react'
import { useMemo, useRef, useState } from 'react'
import {
  deriveGlyphAlternateBehaviors,
  deriveGlyphCombinationBehaviors,
  deriveGlyphContextualBehaviors,
  deriveGlyphSpacingBehaviors,
  isGlyphReferencedByOpenTypeBehaviors,
  type AlternateBehaviorRow,
  type CombinationBehaviorRow,
  type ContextualBehaviorRow,
  type SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { useStore, type FontData, type GlyphData } from 'src/store'
import { CombinationBehaviorList } from 'src/features/editor/rightPanel/behaviors/CombinationBehaviorList'
import { BehaviorPlaceholderSections } from 'src/features/editor/rightPanel/behaviors/BehaviorPlaceholderSections'
import { AlternateBehaviorList } from 'src/features/editor/rightPanel/behaviors/AlternateBehaviorList'
import { SpacingBehaviorList } from 'src/features/editor/rightPanel/behaviors/SpacingBehaviorList'
import { ContextualBehaviorList } from 'src/features/editor/rightPanel/behaviors/ContextualBehaviorList'

interface BehaviorsPanelProps {
  fontData: FontData | null
  glyph: GlyphData
}

export function BehaviorsPanel({ fontData, glyph }: BehaviorsPanelProps) {
  const [draftRowIds, setDraftRowIds] = useState<string[]>([])
  const [alternateDraftRowIds, setAlternateDraftRowIds] = useState<string[]>([])
  const [spacingDraftRowIds, setSpacingDraftRowIds] = useState<string[]>([])
  const [contextualDraftRowIds, setContextualDraftRowIds] = useState<string[]>(
    []
  )
  const [unusedGlyphPrompt, setUnusedGlyphPrompt] =
    useState<UnusedGlyphPrompt | null>(null)
  const cancelUnusedGlyphRef = useRef<HTMLButtonElement | null>(null)
  const unusedGlyphDialog = useDisclosure()
  const upsertCombinationBehavior = useStore(
    (state) => state.upsertCombinationBehavior
  )
  const deleteCombinationBehavior = useStore(
    (state) => state.deleteCombinationBehavior
  )
  const upsertAlternateBehavior = useStore(
    (state) => state.upsertAlternateBehavior
  )
  const deleteAlternateBehavior = useStore(
    (state) => state.deleteAlternateBehavior
  )
  const upsertSpacingBehavior = useStore((state) => state.upsertSpacingBehavior)
  const deleteSpacingBehavior = useStore((state) => state.deleteSpacingBehavior)
  const upsertContextualBehavior = useStore(
    (state) => state.upsertContextualBehavior
  )
  const deleteContextualBehavior = useStore(
    (state) => state.deleteContextualBehavior
  )
  const addGlyphToEditor = useStore((state) => state.addGlyphToEditor)
  const insertGlyphIntoEditor = useStore((state) => state.insertGlyphIntoEditor)
  const deleteGlyph = useStore((state) => state.deleteGlyph)
  const setSelectedGlyphId = useStore((state) => state.setSelectedGlyphId)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  const combinationRows = useMemo(
    () => (fontData ? deriveGlyphCombinationBehaviors(fontData, glyph.id) : []),
    [fontData, glyph.id]
  )
  const alternateRows = useMemo(
    () => (fontData ? deriveGlyphAlternateBehaviors(fontData, glyph.id) : []),
    [fontData, glyph.id]
  )
  const spacingRows = useMemo(
    () => (fontData ? deriveGlyphSpacingBehaviors(fontData, glyph.id) : []),
    [fontData, glyph.id]
  )
  const contextualRows = useMemo(
    () => (fontData ? deriveGlyphContextualBehaviors(fontData, glyph.id) : []),
    [fontData, glyph.id]
  )

  const openGlyph = (glyphId: string) => {
    if (!fontData?.glyphs[glyphId]) return
    addGlyphToEditor(glyphId)
    setSelectedGlyphId(glyphId)
    setWorkspaceView('editor')
  }

  const openSpacingPair = (left: string, right: string) => {
    if (!fontData?.glyphs[left] || !fontData.glyphs[right]) return
    addGlyphToEditor(left)
    insertGlyphIntoEditor(right, left)
    setWorkspaceView('editor')
  }

  const promptUnusedGlyphCleanup = (prompt: UnusedGlyphPrompt) => {
    if (!fontData?.glyphs[prompt.glyphId]) return false
    if (
      isGlyphReferencedByOpenTypeBehaviors(
        fontData.openTypeFeatures,
        prompt.glyphId,
        prompt.ignoredTarget
      )
    ) {
      return false
    }

    setUnusedGlyphPrompt(prompt)
    unusedGlyphDialog.onOpen()
    return true
  }

  const closeUnusedGlyphDialog = () => {
    setUnusedGlyphPrompt(null)
    unusedGlyphDialog.onClose()
  }

  const keepUnusedGlyph = () => {
    unusedGlyphPrompt?.deleteBehavior()
    closeUnusedGlyphDialog()
  }

  const deleteUnusedGlyph = () => {
    if (!unusedGlyphPrompt) return
    unusedGlyphPrompt.deleteBehavior()
    deleteGlyph(unusedGlyphPrompt.glyphId)
    closeUnusedGlyphDialog()
  }

  const deleteCombinationRow = (row: CombinationBehaviorRow) => {
    const deleteBehavior = () =>
      deleteCombinationBehavior(row.lookupId, row.ruleId)
    if (
      promptUnusedGlyphCleanup({
        glyphId: row.output,
        ignoredTarget: { lookupId: row.lookupId, ruleId: row.ruleId },
        deleteBehavior,
      })
    ) {
      return
    }
    deleteBehavior()
  }

  const deleteAlternateRow = (row: AlternateBehaviorRow) => {
    const deleteBehavior = () =>
      deleteAlternateBehavior(row.lookupId, row.ruleId, row.alternate)
    if (
      promptUnusedGlyphCleanup({
        glyphId: row.alternate,
        ignoredTarget: {
          lookupId: row.lookupId,
          ruleId: row.ruleId,
          alternate: row.alternate,
        },
        deleteBehavior,
      })
    ) {
      return
    }
    deleteBehavior()
  }

  const deleteSpacingRow = (row: SpacingBehaviorRow) => {
    deleteSpacingBehavior(row.lookupId, row.ruleId)
  }

  const deleteContextualRow = (row: ContextualBehaviorRow) => {
    deleteContextualBehavior(row.lookupId, row.ruleId)
  }

  return (
    <>
      <Stack spacing={4}>
        <CombinationBehaviorList
          draftRowIds={draftRowIds}
          rows={combinationRows}
          onAddDraftRow={() =>
            setDraftRowIds((rowIds) => [...rowIds, `draft-${Date.now()}`])
          }
          onCommit={(draft) => upsertCombinationBehavior(draft)}
          onDelete={deleteCombinationRow}
          onDraftCommitted={(rowId) =>
            setDraftRowIds((rowIds) => rowIds.filter((id) => id !== rowId))
          }
          onOpenGlyph={openGlyph}
        />
        <AlternateBehaviorList
          currentGlyphId={glyph.id}
          draftRowIds={alternateDraftRowIds}
          rows={alternateRows}
          onAddDraftRow={() =>
            setAlternateDraftRowIds((rowIds) => [
              ...rowIds,
              `alternate-draft-${Date.now()}`,
            ])
          }
          onCommit={(draft) => upsertAlternateBehavior(draft)}
          onDelete={deleteAlternateRow}
          onDraftCommitted={(rowId) =>
            setAlternateDraftRowIds((rowIds) =>
              rowIds.filter((id) => id !== rowId)
            )
          }
          onOpenGlyph={openGlyph}
        />
        <SpacingBehaviorList
          currentGlyphId={glyph.id}
          draftRowIds={spacingDraftRowIds}
          rows={spacingRows}
          onAddDraftRow={() =>
            setSpacingDraftRowIds((rowIds) => [
              ...rowIds,
              `spacing-draft-${Date.now()}`,
            ])
          }
          onCommit={(draft) => upsertSpacingBehavior(draft)}
          onDelete={deleteSpacingRow}
          onDraftCommitted={(rowId) =>
            setSpacingDraftRowIds((rowIds) =>
              rowIds.filter((id) => id !== rowId)
            )
          }
          onOpenPair={openSpacingPair}
        />
        <ContextualBehaviorList
          currentGlyphId={glyph.id}
          draftRowIds={contextualDraftRowIds}
          rows={contextualRows}
          onAddDraftRow={() =>
            setContextualDraftRowIds((rowIds) => [
              ...rowIds,
              `contextual-draft-${Date.now()}`,
            ])
          }
          onCommit={(draft) => upsertContextualBehavior(draft)}
          onDelete={deleteContextualRow}
          onDraftCommitted={(rowId) =>
            setContextualDraftRowIds((rowIds) =>
              rowIds.filter((id) => id !== rowId)
            )
          }
        />
        <BehaviorPlaceholderSections />
      </Stack>

      <AlertDialog
        isOpen={unusedGlyphDialog.isOpen}
        leastDestructiveRef={cancelUnusedGlyphRef}
        onClose={closeUnusedGlyphDialog}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Unused glyph
            </AlertDialogHeader>
            <AlertDialogBody>
              {unusedGlyphPrompt?.glyphId} is no longer used by any behavior.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelUnusedGlyphRef} onClick={keepUnusedGlyph}>
                Keep
              </Button>
              <Button colorScheme="red" ml={3} onClick={deleteUnusedGlyph}>
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  )
}

interface UnusedGlyphPrompt {
  glyphId: string
  ignoredTarget: {
    lookupId: string
    ruleId: string
    alternate?: string
  }
  deleteBehavior: () => void
}
