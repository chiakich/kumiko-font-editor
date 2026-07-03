import { Badge, Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { MinusCircle, PlusCircle } from 'iconoir-react'
import { useState } from 'react'
import type {
  SpacingBehaviorDraft,
  SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { SpacingBehaviorTableRow } from 'src/features/editor/rightPanel/behaviors/SpacingBehaviorTableRow'
import { useTranslation } from 'react-i18next'

interface SpacingBehaviorListProps {
  rows: SpacingBehaviorRow[]
  currentGlyphId: string
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: (row: SpacingBehaviorRow) => void
}

export function SpacingBehaviorList({
  rows,
  currentGlyphId,
  onCommit,
  onDelete,
}: SpacingBehaviorListProps) {
  const { t } = useTranslation()

  const leftRows = rows.filter((row) => row.right === currentGlyphId)
  const rightRows = rows.filter((row) => row.left === currentGlyphId)

  return (
    <Stack gap={2}>
      <HStack justify="space-between" align="center">
        <HStack gap={2}>
          <Text fontSize="sm" fontWeight="semibold">
            {t('editor.spacing')}
          </Text>
          <Badge colorPalette="gray">{rows.length}</Badge>
        </HStack>
      </HStack>
      <SpacingBehaviorGroup
        title={t('editor.leftSpacing')}
        side="left"
        rows={leftRows}
        currentGlyphId={currentGlyphId}
        emptyLabel="No left-side pairs yet."
        onCommit={onCommit}
        onDelete={onDelete}
      />
      <SpacingBehaviorGroup
        title={t('editor.rightSpacing')}
        side="right"
        rows={rightRows}
        currentGlyphId={currentGlyphId}
        emptyLabel="No right-side pairs yet."
        onCommit={onCommit}
        onDelete={onDelete}
      />
    </Stack>
  )
}

interface SpacingBehaviorGroupProps {
  title: string
  side: 'left' | 'right'
  rows: SpacingBehaviorRow[]
  currentGlyphId: string
  emptyLabel: string
  onCommit: (draft: SpacingBehaviorDraft) => void
  onDelete: (row: SpacingBehaviorRow) => void
}

function SpacingBehaviorGroup({
  title,
  side,
  rows,
  currentGlyphId,
  emptyLabel,
  onCommit,
  onDelete,
}: SpacingBehaviorGroupProps) {
  const { t } = useTranslation()
  const [draftRowIds, setDraftRowIds] = useState<string[]>([])

  const addDraftRow = () =>
    setDraftRowIds((rowIds) => [
      ...rowIds,
      `${side}-spacing-draft-${Date.now()}`,
    ])
  const removeDraftRow = (rowId: string) =>
    setDraftRowIds((rowIds) => rowIds.filter((id) => id !== rowId))

  return (
    <Box borderWidth="1px" borderColor="border" bg="card">
      <HStack
        justify="space-between"
        px={3}
        py={2}
        bg="muted"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <HStack gap={2}>
          <Text fontSize="xs" fontWeight="bold">
            {title}
          </Text>
          <Badge colorPalette="gray">{rows.length}</Badge>
        </HStack>
        <HStack gap={1}>
          <Tooltip content={`Add ${title.toLowerCase()} pair`}>
            <IconButton
              aria-label={`新增 ${title} pair`}
              size="xs"
              variant="ghost"
              onClick={addDraftRow}
            >
              <PlusCircle width={16} height={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('editor.removeTheLastDraftRow')}>
            <IconButton
              aria-label={`移除最後一列 ${title} 草稿`}
              size="xs"
              variant="ghost"
              disabled={draftRowIds.length === 0}
              onClick={() => removeDraftRow(draftRowIds.at(-1) ?? '')}
            >
              <MinusCircle width={16} height={16} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </HStack>
      </HStack>
      <SpacingHeader side={side} />
      {rows.length === 0 && draftRowIds.length === 0 ? (
        <Text fontSize="xs" color="mutedForeground" px={3} py={3}>
          {emptyLabel}
        </Text>
      ) : null}
      {rows.map((row) => (
        <SpacingBehaviorTableRow
          key={getSpacingRowKey(row)}
          row={row}
          side={side}
          currentGlyphId={currentGlyphId}
          onCommit={onCommit}
          onDelete={() => onDelete(row)}
        />
      ))}
      {draftRowIds.map((rowId) => (
        <SpacingBehaviorTableRow
          key={rowId}
          rowId={rowId}
          side={side}
          currentGlyphId={currentGlyphId}
          onCommit={onCommit}
          onDelete={() => removeDraftRow(rowId)}
          onDraftCommitted={() => removeDraftRow(rowId)}
        />
      ))}
    </Box>
  )
}

function getSpacingRowKey(row: SpacingBehaviorRow) {
  return [
    row.id,
    row.left,
    row.right,
    row.value,
    row.featureTag,
    row.sourceLabel,
  ].join(':')
}

function SpacingHeader({ side }: { side: 'left' | 'right' }) {
  const { t } = useTranslation()

  return (
    <Box
      display="grid"
      gridTemplateColumns="minmax(48px, 1fr) minmax(48px, 1fr) 96px"
      gap={1}
      px={3}
      py={2}
      bg="muted"
      borderBottomWidth="1px"
      borderColor="border"
    >
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {side === 'left' ? 'Editable left' : 'Fixed left'}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {side === 'left' ? 'Fixed right' : 'Editable right'}
      </Text>
      <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
        {t('editor.value')}
      </Text>
    </Box>
  )
}
