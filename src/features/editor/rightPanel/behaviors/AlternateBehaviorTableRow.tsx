import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Select,
  Stack,
  Tooltip,
} from '@chakra-ui/react'
import { NavArrowRight, Trash } from 'iconoir-react'
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  ALTERNATE_BEHAVIOR_TYPE_LABELS,
  ALTERNATE_BEHAVIOR_TYPES,
  canCommitAlternateBehavior,
  resolveAlternateFeatureTag,
  suggestAlternateGlyphName,
  type AlternateBehaviorDraft,
  type AlternateBehaviorRow,
  type AlternateBehaviorType,
} from 'src/lib/openTypeFeatures'

interface AlternateBehaviorTableRowProps {
  row?: AlternateBehaviorRow
  rowId?: string
  currentGlyphId?: string
  onCommit: (draft: AlternateBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
  onOpenGlyph: (glyphId: string) => void
}

export function AlternateBehaviorTableRow({
  row,
  rowId,
  currentGlyphId = '',
  onCommit,
  onDelete,
  onDraftCommitted,
  onOpenGlyph,
}: AlternateBehaviorTableRowProps) {
  const [source, setSource] = useState(row?.source ?? currentGlyphId)
  const [alternate, setAlternate] = useState(
    row?.alternate ?? suggestAlternateGlyphName(currentGlyphId)
  )
  const [type, setType] = useState<AlternateBehaviorType>(
    row?.type ?? 'stylisticAlternate'
  )
  const [customFeatureTag, setCustomFeatureTag] = useState(
    row?.type === 'customFeature' ? row.featureTag : ''
  )
  const [alternateEdited, setAlternateEdited] = useState(
    Boolean(row?.alternate)
  )

  const draft: AlternateBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    source,
    alternate,
    type,
    customFeatureTag,
  }
  const canCommit = canCommitAlternateBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const updateSource = (value: string) => {
    const shouldSuggestAlternate =
      !alternateEdited || alternate === suggestAlternateGlyphName(source)
    setSource(value)
    if (shouldSuggestAlternate) {
      setAlternate(suggestAlternateGlyphName(value))
    }
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
      <Box
        display="grid"
        gridTemplateColumns="minmax(76px, 1fr) 14px minmax(76px, 1fr) 28px 28px"
        gap={1}
        alignItems="center"
      >
        <Input
          aria-label="Alternate source glyph"
          value={source}
          size="xs"
          placeholder="f"
          onBlur={commit}
          onChange={(event) => updateSource(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <NavArrowRight width={14} height={14} aria-hidden="true" />
        <Input
          aria-label="Alternate glyph"
          value={alternate}
          size="xs"
          placeholder="f.alt"
          onBlur={commit}
          onChange={(event) => {
            setAlternateEdited(true)
            setAlternate(event.target.value)
          }}
          onKeyDown={commitOnEnter}
        />
        <Tooltip label="Open alternate glyph">
          <IconButton
            aria-label="開啟 alternate glyph"
            icon={<NavArrowRight width={15} height={15} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            isDisabled={!alternate}
            onClick={() => onOpenGlyph(alternate)}
          />
        </Tooltip>
        <Tooltip label="Delete behavior">
          <IconButton
            aria-label="刪除 alternate"
            icon={<Trash width={15} height={15} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            color="field.red.500"
            onClick={onDelete}
          />
        </Tooltip>
      </Box>

      <Box
        display="grid"
        gridTemplateColumns={
          type === 'customFeature' ? 'minmax(0, 1fr) 64px' : 'minmax(0, 1fr)'
        }
        gap={1}
      >
        <Select
          aria-label="Alternate behavior type"
          value={type}
          size="xs"
          onBlur={commit}
          onChange={(event) => {
            const nextType = event.target.value as AlternateBehaviorType
            setType(nextType)
            if (nextType !== 'customFeature') {
              setCustomFeatureTag('')
            }
          }}
        >
          {ALTERNATE_BEHAVIOR_TYPES.map((behaviorType) => (
            <option key={behaviorType} value={behaviorType}>
              {ALTERNATE_BEHAVIOR_TYPE_LABELS[behaviorType]}
            </option>
          ))}
        </Select>
        {type === 'customFeature' ? (
          <Input
            aria-label="Custom alternate feature tag"
            value={customFeatureTag}
            size="xs"
            maxLength={4}
            placeholder="xxxx"
            onBlur={commit}
            onChange={(event) => setCustomFeatureTag(event.target.value)}
            onKeyDown={commitOnEnter}
          />
        ) : null}
      </Box>

      <HStack spacing={1} justify="space-between" align="flex-start">
        <HStack spacing={1} wrap="wrap">
          {row?.sourceLabel ? (
            <Badge variant="subtle" colorScheme="gray">
              {row.sourceLabel}
            </Badge>
          ) : null}
          {type === 'customFeature' ? (
            <Badge variant="subtle" colorScheme="gray">
              {resolveAlternateFeatureTag(draft) || 'tag'}
            </Badge>
          ) : null}
        </HStack>
        <HStack spacing={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorScheme="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (source || alternate) ? (
            <Badge colorScheme="red">Invalid Input</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
