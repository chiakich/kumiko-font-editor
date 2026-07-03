import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
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
    <Stack gap={2}>
      <HStack justify="space-between" align="center">
        <HStack gap={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.anchors')}
          </Text>
          <Badge colorPalette="gray">{rows.length}</Badge>
        </HStack>
        <HStack gap={1}>
          <Tooltip content={t('editor.addAnchor')}>
            <IconButton
              aria-label={t('editor.addAnchor')}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            >
              <PlusCircle width={17} height={17} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={t('editor.removeLastAnchorDraft')}
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
        <AnchorHeader />
        {rows.length === 0 && draftRowIds.length === 0 ? (
          <Text fontSize="xs" color="mutedForeground" px={3} py={3}>
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
      bg="muted"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {t('editor.name')}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        X
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        Y
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {t('editor.type')}
      </Text>
    </Box>
  )
}
