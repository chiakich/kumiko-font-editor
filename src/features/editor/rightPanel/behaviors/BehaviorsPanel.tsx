import { useToast } from '@/components/ui/toast'
import { Button, Stack, useDisclosure, Dialog, Portal } from '@chakra-ui/react'
import { useMemo, useRef, useState } from 'react'
import {
  deriveGlyphAlternateBehaviors,
  deriveGlyphAnchorBehaviors,
  deriveGlyphCombinationBehaviors,
  deriveGlyphContextualBehaviors,
  deriveGlyphSpacingBehaviors,
  isGlyphReferencedByOpenTypeBehaviors,
  type AlternateBehaviorRow,
  type AnchorBehaviorRow,
  type CombinationBehaviorRow,
  type ContextualBehaviorRow,
  type SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { useStore, type FontData, type GlyphData } from 'src/store'
import { useFlushCurrentDraft } from 'src/hooks/useFlushCurrentDraft'
import { CombinationBehaviorList } from 'src/features/editor/rightPanel/behaviors/CombinationBehaviorList'
import { AlternateBehaviorList } from 'src/features/editor/rightPanel/behaviors/AlternateBehaviorList'
import { SpacingBehaviorList } from 'src/features/editor/rightPanel/behaviors/SpacingBehaviorList'
import { ContextualBehaviorList } from 'src/features/editor/rightPanel/behaviors/ContextualBehaviorList'
import { AnchorBehaviorList } from 'src/features/editor/rightPanel/behaviors/AnchorBehaviorList'
import { useTranslation } from 'react-i18next'

interface BehaviorsPanelProps {
  fontData: FontData | null
  glyph: GlyphData
}

export function BehaviorsPanel({ fontData, glyph }: BehaviorsPanelProps) {
  const { t } = useTranslation()
  const toast = useToast()

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
  const flushCurrentDraft = useFlushCurrentDraft()
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
  const upsertAnchorBehavior = useStore((state) => state.upsertAnchorBehavior)
  const deleteAnchorBehavior = useStore((state) => state.deleteAnchorBehavior)
  const deleteGlyph = useStore((state) => state.deleteGlyph)

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
  const anchorRows = useMemo(
    () => (fontData ? deriveGlyphAnchorBehaviors(fontData, glyph.id) : []),
    [fontData, glyph.id]
  )

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

  const deleteUnusedGlyph = async () => {
    if (!unusedGlyphPrompt) return
    try {
      unusedGlyphPrompt.deleteBehavior()
      deleteGlyph(unusedGlyphPrompt.glyphId)
      await flushCurrentDraft()
      closeUnusedGlyphDialog()
    } catch (error) {
      toast({
        title: '刪除後儲存失敗',
        description: '字符已從目前工作階段移除，但尚未寫入本機專案。',
        status: 'error',
        duration: 3600,
        isClosable: true,
      })
      console.warn('Flush after unused glyph deletion failed.', error)
    }
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

  const deleteAnchorRow = (row: AnchorBehaviorRow) => {
    deleteAnchorBehavior(row.glyphId, row.id)
  }

  return (
    <>
      <Stack gap={4}>
        <CombinationBehaviorList
          rows={combinationRows}
          onCommit={(draft) => upsertCombinationBehavior(draft)}
          onDelete={deleteCombinationRow}
        />
        <AlternateBehaviorList
          currentGlyphId={glyph.id}
          rows={alternateRows}
          onCommit={(draft) => upsertAlternateBehavior(draft)}
          onDelete={deleteAlternateRow}
        />
        <SpacingBehaviorList
          currentGlyphId={glyph.id}
          rows={spacingRows}
          onCommit={(draft) => upsertSpacingBehavior(draft)}
          onDelete={deleteSpacingRow}
        />
        <ContextualBehaviorList
          currentGlyphId={glyph.id}
          rows={contextualRows}
          onCommit={(draft) => upsertContextualBehavior(draft)}
          onDelete={deleteContextualRow}
        />
        <AnchorBehaviorList
          currentGlyphId={glyph.id}
          rows={anchorRows}
          onCommit={(draft) => upsertAnchorBehavior(draft)}
          onDelete={deleteAnchorRow}
        />
      </Stack>
      <Dialog.Root
        open={unusedGlyphDialog.open}
        initialFocusEl={() => cancelUnusedGlyphRef.current}
        role="alertdialog"
        onOpenChange={(e) => {
          if (!e.open) {
            closeUnusedGlyphDialog()
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop>
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.Header fontSize="lg" fontWeight="bold">
                  {t('editor.unusedGlyph')}
                </Dialog.Header>
                <Dialog.Body>
                  {unusedGlyphPrompt?.glyphId} {t('editor.isNoLongerUsedByAny')}
                </Dialog.Body>
                <Dialog.Footer>
                  <Button ref={cancelUnusedGlyphRef} onClick={keepUnusedGlyph}>
                    {t('editor.keep')}
                  </Button>
                  <Button colorPalette="red" ml={3} onClick={deleteUnusedGlyph}>
                    {t('editor.delete')}
                  </Button>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Dialog.Backdrop>
        </Portal>
      </Dialog.Root>
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
