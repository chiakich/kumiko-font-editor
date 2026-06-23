import {
  Badge,
  Box,
  HStack,
  IconButton,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react'
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
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.alternates')}
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label={t('editor.addAlternate')}>
            <IconButton
              aria-label={t('editor.addAlternate')}
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            />
          </Tooltip>
          <Tooltip label={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={t('editor.removeLastAlternateDraft')}
              icon={<MinusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              isDisabled={draftRowIds.length === 0}
              onClick={() => removeDraftRow(draftRowIds.at(-1) ?? '')}
            />
          </Tooltip>
        </HStack>
      </HStack>

      <Box borderWidth="1px" borderColor="field.line" bg="field.panel">
        <AlternateHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
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
      bg="field.panelMuted"
      borderBottomWidth="1px"
      borderColor="field.line"
    >
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {t('editor.default')}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        →
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {t('editor.alternate')}
      </Text>
    </Box>
  )
}
