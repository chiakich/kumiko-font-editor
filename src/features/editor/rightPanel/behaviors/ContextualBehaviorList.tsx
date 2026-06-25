import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { MinusCircle, PlusCircle } from 'iconoir-react'
import { useState } from 'react'
import type {
  ContextualBehaviorDraft,
  ContextualBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { ContextualBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/ContextualBehaviorTableRow'
import { useTranslation } from 'react-i18next'

interface ContextualBehaviorListProps {
  rows: ContextualBehaviorRow[]
  currentGlyphId: string
  onCommit: (draft: ContextualBehaviorDraft) => void
  onDelete: (row: ContextualBehaviorRow) => void
}

export function ContextualBehaviorList({
  rows,
  currentGlyphId,
  onCommit,
  onDelete,
}: ContextualBehaviorListProps) {
  const { t } = useTranslation()
  const [draftRowIds, setDraftRowIds] = useState<string[]>([])

  const addDraftRow = () =>
    setDraftRowIds((rowIds) => [...rowIds, `contextual-draft-${Date.now()}`])
  const removeDraftRow = (rowId: string) =>
    setDraftRowIds((rowIds) => rowIds.filter((id) => id !== rowId))

  return (
    <Stack gap={2}>
      <HStack justify="space-between" align="center">
        <HStack gap={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.contextual')}
          </Text>
          <Badge colorPalette="gray">{rows.length}</Badge>
        </HStack>
        <HStack gap={1}>
          <Tooltip content={t('editor.addContextualRule')}>
            <IconButton
              aria-label={t('editor.addContextualRule')}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            >
              <PlusCircle width={17} height={17} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={t('editor.removeLastContextualDraft')}
              size="xs"
              variant="ghost"
              disabled={draftRowIds.length === 0}
              onClick={() => removeDraftRow(draftRowIds.at(-1) ?? '')}
            >
              <MinusCircle width={17} height={17} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </HStack>
      </HStack>
      <Box borderWidth="1px" borderColor="field.line" bg="field.panel">
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            {t('editor.noContextualRulesForThisGlyph')}
          </Text>
        ) : null}
        {rows.map((row) => (
          <ContextualBehaviorTableRow
            key={getContextualRowKey(row)}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <ContextualBehaviorTableRow
            key={rowId}
            rowId={rowId}
            currentGlyphId={currentGlyphId}
            onCommit={onCommit}
            onDelete={() => removeDraftRow(rowId)}
            onDraftCommitted={() => removeDraftRow(rowId)}
          />
        ))}
      </Box>
    </Stack>
  )
}

function getContextualRowKey(row: ContextualBehaviorRow) {
  return [
    row.id,
    row.before,
    row.source,
    row.after,
    row.replacement,
    row.sourceLabel,
  ].join(':')
}
