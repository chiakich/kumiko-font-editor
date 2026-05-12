import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
  Tooltip,
} from '@chakra-ui/react'
import { NavArrowRight, Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  canCommitContextualBehavior,
  type ContextualBehaviorDraft,
  type ContextualBehaviorRow,
} from 'src/lib/openTypeFeatures'

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
      spacing={2}
      px={3}
      py={2}
      borderTopWidth={row || rowId ? '1px' : 0}
      borderColor="field.panelMuted"
    >
      <Stack spacing={1}>
        <Text fontSize="10px" fontWeight="bold" color="field.muted">
          When
        </Text>
        <Box
          display="grid"
          gridTemplateColumns="minmax(44px, 1fr) minmax(44px, 1fr) minmax(44px, 1fr) 28px"
          gap={1}
          alignItems="center"
        >
          <Input
            aria-label="Context before glyphs"
            value={before}
            size="xs"
            placeholder="before"
            onBlur={commit}
            onChange={(event) => setBefore(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <Input
            aria-label="Context source glyph"
            value={source}
            size="xs"
            placeholder="glyph"
            onBlur={commit}
            onChange={(event) => setSource(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <Input
            aria-label="Context after glyphs"
            value={after}
            size="xs"
            placeholder="after"
            onBlur={commit}
            onChange={(event) => setAfter(event.target.value)}
            onKeyDown={commitOnEnter}
          />
          <Tooltip label="Delete contextual rule">
            <IconButton
              aria-label="刪除 contextual rule"
              icon={<Trash width={15} height={15} aria-hidden="true" />}
              size="xs"
              variant="ghost"
              color="field.red.500"
              onClick={onDelete}
            />
          </Tooltip>
        </Box>
      </Stack>

      <Box
        display="grid"
        gridTemplateColumns="minmax(0, 1fr) 14px minmax(0, 1fr)"
        gap={1}
        alignItems="center"
      >
        <Box px={2} py={1} bg="field.panelMuted" borderRadius="2px">
          <Text fontSize="xs" fontFamily="mono" isTruncated>
            {source || 'glyph'}
          </Text>
        </Box>
        <NavArrowRight width={14} height={14} aria-hidden="true" />
        <Input
          aria-label="Context replacement glyph"
          value={replacement}
          size="xs"
          placeholder="glyph.alt"
          onBlur={commit}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={commitOnEnter}
        />
      </Box>

      <HStack justify="space-between" align="flex-start">
        <HStack spacing={1} wrap="wrap">
          {row?.sourceLabel ? (
            <Badge variant="subtle" colorScheme="gray">
              {row.sourceLabel}
            </Badge>
          ) : null}
        </HStack>
        <HStack spacing={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorScheme="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (before || after || source || replacement) ? (
            <Badge colorScheme="red">Invalid Input</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
