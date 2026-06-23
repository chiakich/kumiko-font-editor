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
  AnchorBehaviorDraft,
  AnchorBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { AnchorBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/AnchorBehaviorTableRow'
import { useTranslation } from 'react-i18next'

interface AnchorBehaviorListProps {
  rows: AnchorBehaviorRow[]
  currentGlyphId: string
  onCommit: (draft: AnchorBehaviorDraft) => void
  onDelete: (row: AnchorBehaviorRow) => void
}

export function AnchorBehaviorList({
  rows,
  currentGlyphId,
  onCommit,
  onDelete,
}: AnchorBehaviorListProps) {
  const { t } = useTranslation()
  const [draftRowIds, setDraftRowIds] = useState<string[]>([])

  const addDraftRow = () =>
    setDraftRowIds((rowIds) => [...rowIds, `anchor-draft-${Date.now()}`])
  const removeDraftRow = (rowId: string) =>
    setDraftRowIds((rowIds) => rowIds.filter((id) => id !== rowId))

  return (
    <Stack spacing={2}>
      <HStack justify="space-between" align="center">
        <HStack spacing={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.anchors')}
          </Text>
          <Badge colorScheme="gray">{rows.length}</Badge>
        </HStack>
        <HStack spacing={1}>
          <Tooltip label={t('editor.addAnchor')}>
            <IconButton
              aria-label={t('editor.addAnchor')}
              icon={<PlusCircle width={17} height={17} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            />
          </Tooltip>
          <Tooltip label={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={t('editor.removeLastAnchorDraft')}
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
        <AnchorHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="field.muted" px={3} py={3}>
            {t('editor.noAnchorsForThisGlyphYet')}
          </Text>
        ) : null}
        {rows.map((row) => (
          <AnchorBehaviorTableRow
            key={getAnchorRowKey(row)}
            row={row}
            onCommit={onCommit}
            onDelete={() => onDelete(row)}
          />
        ))}
        {draftRowIds.map((rowId) => (
          <AnchorBehaviorTableRow
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

function getAnchorRowKey(row: AnchorBehaviorRow) {
  return [row.id, row.name, row.x, row.y, ...row.status].join(':')
}

function AnchorHeader() {
  const { t } = useTranslation()

  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(68px, 1fr) 54px 54px 52px"
      gap={1}
      px={3}
      py={2}
      bg="field.panelMuted"
      borderBottomWidth="1px"
      borderColor="field.line"
    >
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {t('editor.name')}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        X
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        Y
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="field.muted">
        {t('editor.type')}
      </Text>
    </Box>
  )
}
