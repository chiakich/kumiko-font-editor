import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { NavArrowRight, Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  canCommitContextualBehavior,
  type ContextualBehaviorDraft,
  type ContextualBehaviorRow,
} from 'src/lib/openTypeFeatures'
import { useTranslation } from 'react-i18next'

interface ContextualBehaviorTableRowProps {
  row?: ContextualBehaviorRow
  rowId?: string
  currentGlyphId?: string
  onCommit: (draft: ContextualBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
}

export function ContextualBehaviorTableRow({
  row,
  rowId,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
}: ContextualBehaviorTableRowProps) {
  const { t } = useTranslation()

  const [before, setBefore] = useState(row?.before ?? '')
  const [source, setSource] = useState(row?.source ?? currentGlyphId)
  const [after, setAfter] = useState(row?.after ?? '')
  const [replacement, setReplacement] = useState(
    row?.replacement ?? `${currentGlyphId}.end`
  )

  const draft: ContextualBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    before,
    source,
    after,
    replacement,
  }
  const canCommit = canCommitContextualBehavior(draft)

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
      <Stack gap={1}>
        <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
          {t('editor.when')}
        </Text>
        <Box
          display="grid"
          gridTemplateColumns="minmax(44px, 1fr) minmax(44px, 1fr) minmax(44px, 1fr) 28px"
          gap={1}
          alignItems="center"
        >
          <Input
            aria-label={t('editor.contextBeforeGlyphs')}
            value={before}
            size="xs"
            placeholder={t('editor.before')}
            onBlur={commit}
            onChange={(event) => setBefore(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <Input
            aria-label={t('editor.contextSourceGlyph')}
            value={source}
            size="xs"
            placeholder={t('editor.glyph')}
            onBlur={commit}
            onChange={(event) => setSource(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <Input
            aria-label={t('editor.contextAfterGlyphs')}
            value={after}
            size="xs"
            placeholder={t('editor.after')}
            onBlur={commit}
            onChange={(event) => setAfter(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <Tooltip content={t('editor.deleteContextualRule')}>
            <IconButton
              aria-label={t('editor.deleteContextualRule')}
              size="xs"
              variant="ghost"
              color="destructive"
              onClick={onDelete}
            >
              <Trash width={15} height={15} aria-hidden="true" />
            </IconButton>
          </Tooltip>
        </Box>
      </Stack>
      <Box
        display="grid"
        gridTemplateColumns="minmax(0, 1fr) 14px minmax(0, 1fr)"
        gap={1}
        alignItems="center"
      >
        <Box px={2} py={1} bg="muted" borderRadius="2px">
          <Text fontSize="xs" fontFamily="mono" truncate>
            {source || 'glyph'}
          </Text>
        </Box>
        <NavArrowRight width={14} height={14} aria-hidden="true" />
        <Input
          aria-label={t('editor.contextReplacementGlyph')}
          value={replacement}
          size="xs"
          placeholder="glyph.alt"
          onBlur={commit}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={commitOnEnter}
        />
      </Box>
      <HStack justify="space-between" align="flex-start">
        <HStack gap={1} wrap="wrap">
          {row?.sourceLabel ? (
            <Badge variant="subtle" colorPalette="gray">
              {row.sourceLabel}
            </Badge>
          ) : null}
        </HStack>
        <HStack gap={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorPalette="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (before || after || source || replacement) ? (
            <Badge colorPalette="red">{t('editor.invalidInput')}</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
