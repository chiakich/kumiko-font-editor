import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { MinusCircle, PlusCircle } from 'iconoir-react'
import { useState } from 'react'
import type {
  CombinationBehaviorDraft,
  CombinationBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { CombinationBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/CombinationBehaviorTableRow'
import { useTranslation } from 'react-i18next'

interface CombinationBehaviorListProps {
  rows: CombinationBehaviorRow[]
  onCommit: (draft: CombinationBehaviorDraft) => void
  onDelete: (row: CombinationBehaviorRow) => void
}

export function CombinationBehaviorList({
  rows,
  onCommit,
  onDelete,
}: CombinationBehaviorListProps) {
  const { t } = useTranslation()
  const [draftRowIds, setDraftRowIds] = useState<string[]>([])

  const addDraftRow = () =>
    setDraftRowIds((rowIds) => [...rowIds, `draft-${Date.now()}`])
  const removeDraftRow = (rowId: string) =>
    setDraftRowIds((rowIds) => rowIds.filter((id) => id !== rowId))

  return (
    <Stack gap={2}>
      <HStack justify="space-between" align="center">
        <HStack gap={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.combinations')}
          </Text>
          <Badge colorPalette="gray">{rows.length}</Badge>
        </HStack>
        <HStack gap={1}>
          <Tooltip content={t('editor.addCombination')}>
            <IconButton
              aria-label={t('editor.addCombination')}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            >
              <PlusCircle width={17} height={17} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={t('editor.removeLastDraftRow')}
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
        <CombinationHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            {t('editor.noCombinationsForThisGlyphYet')}
          </Text>
        ) : null}
        {rows.map((row) => (
          <CombinationBehaviorTableRow
            key={getCombinationRowKey(row)}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <CombinationBehaviorTableRow
            key={rowId}
            rowId={rowId}
            onCommit={onCommit}
            onDelete={() => removeDraftRow(rowId)}
            onDraftCommitted={() => removeDraftRow(rowId)}
          />
        ))}
      </Box>
    </Stack>
  )
}

function getCombinationRowKey(row: CombinationBehaviorRow) {
  return [
    row.id,
    row.input,
    row.output,
    row.type,
    row.featureTag,
    row.sourceLabel,
  ].join(':')
}

function CombinationHeader() {
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
        {t('editor.input')}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        →
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {t('editor.output')}
      </Text>
    </Box>
  )
}
