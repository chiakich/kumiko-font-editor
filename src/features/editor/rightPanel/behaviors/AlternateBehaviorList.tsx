import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { MinusCircle, PlusCircle } from 'iconoir-react'
import { useState } from 'react'
import type {
  AlternateBehaviorDraft,
  AlternateBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { AlternateBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/AlternateBehaviorTableRow'
import { useTranslation } from 'react-i18next'

interface AlternateBehaviorListProps {
  rows: AlternateBehaviorRow[]
  currentGlyphId: string
  onCommit: (draft: AlternateBehaviorDraft) => void
  onDelete: (row: AlternateBehaviorRow) => void
}

export function AlternateBehaviorList({
  rows,
  currentGlyphId,
  onCommit,
  onDelete,
}: AlternateBehaviorListProps) {
  const { t } = useTranslation()
  const [draftRowIds, setDraftRowIds] = useState<string[]>([])

  const addDraftRow = () =>
    setDraftRowIds((rowIds) => [...rowIds, `alternate-draft-${Date.now()}`])
  const removeDraftRow = (rowId: string) =>
    setDraftRowIds((rowIds) => rowIds.filter((id) => id !== rowId))

  return (
    <Stack gap={2}>
      <HStack justify="space-between" align="center">
        <HStack gap={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.alternates')}
          </Text>
          <Badge colorPalette="gray">{rows.length}</Badge>
        </HStack>
        <HStack gap={1}>
          <Tooltip content={t('editor.addAlternate')}>
            <IconButton
              aria-label={t('editor.addAlternate')}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            >
              <PlusCircle width={17} height={17} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={t('editor.removeLastAlternateDraft')}
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
      <Box borderWidth="1px" borderColor="border" bg="card">
        <AlternateHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="mutedForeground" px={3} py={3}>
            {t('editor.noAlternatesForThisGlyphYet')}
          </Text>
        ) : null}
        {rows.map((row) => (
          <AlternateBehaviorTableRow
            key={getAlternateRowKey(row)}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <AlternateBehaviorTableRow
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

function getAlternateRowKey(row: AlternateBehaviorRow) {
  return [
    row.id,
    row.source,
    row.alternate,
    row.type,
    row.featureTag,
    row.sourceLabel,
  ].join(':')
}

function AlternateHeader() {
  const { t } = useTranslation()

  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(76px, 1fr) 14px minmax(76px, 1fr)"
      gap={1}
      px={3}
      py={2}
      bg="muted"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {t('editor.default')}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        →
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {t('editor.alternate')}
      </Text>
    </Box>
  )
}
