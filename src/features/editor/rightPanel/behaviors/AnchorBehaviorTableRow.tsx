import { Badge, Box, HStack, IconButton, Input, Stack } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  canCommitAnchorBehavior,
  type AnchorBehaviorDraft,
  type AnchorBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface AnchorBehaviorTableRowProps {
  row?: AnchorBehaviorRow
  rowId?: string
  currentGlyphId?: string
  onCommit: (draft: AnchorBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
}

export function AnchorBehaviorTableRow({
  row,
  rowId,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
}: AnchorBehaviorTableRowProps) {
  const { t } = useTranslation()

  const [name, setName] = useState(row?.name ?? 'top')
  const [x, setX] = useState(String(row?.x ?? 0))
  const [y, setY] = useState(String(row?.y ?? 700))

  const numericX = Number.parseInt(x, 10)
  const numericY = Number.parseInt(y, 10)
  const draft: AnchorBehaviorDraft = {
    id: row?.id,
    glyphId: row?.glyphId ?? currentGlyphId,
    name,
    x: Number.isFinite(numericX) ? numericX : Number.NaN,
    y: Number.isFinite(numericY) ? numericY : Number.NaN,
  }
  const canCommit = canCommitAnchorBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const commitOnEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.blur()
      }
      commit()
    }
  }

  return (
    <Stack
      gap={2}
      px={3}
      py={2}
      borderTopWidth={row || rowId ? '1px' : 0}
      borderColor="muted"
    >
      <Box
        display="grid"
        gridTemplateColumns="minmax(68px, 1fr) 54px 54px 28px"
        gap={1}
        alignItems="center"
      >
        <Input
          aria-label={t('editor.anchorName')}
          value={name}
          size="xs"
          placeholder={t('editor.top')}
          onBlur={commit}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <Input
          aria-label={t('editor.anchorX')}
          value={x}
          size="xs"
          inputMode="numeric"
          onBlur={commit}
          onChange={(event) => setX(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <Input
          aria-label={t('editor.anchorY')}
          value={y}
          size="xs"
          inputMode="numeric"
          onBlur={commit}
          onChange={(event) => setY(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <Tooltip content={t('editor.deleteAnchor')}>
          <IconButton
            aria-label={t('editor.deleteAnchor')}
            size="xs"
            variant="ghost"
            color="destructive"
            onClick={onDelete}
          >
            <Trash width={15} height={15} aria-hidden="true" />
          </IconButton>
        </Tooltip>
      </Box>
      <HStack justify="space-between" align="center">
        <Badge colorPalette={name.startsWith('_') ? 'purple' : 'cyan'}>
          {name.startsWith('_') ? 'Mark' : 'Base'}
        </Badge>
        <HStack gap={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorPalette="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (name || x || y) ? (
            <Badge colorPalette="red">{t('editor.invalidInput')}</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
