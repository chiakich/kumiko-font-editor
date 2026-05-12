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
  COMBINATION_BEHAVIOR_TYPE_LABELS,
  COMBINATION_BEHAVIOR_TYPES,
  canCommitCombinationBehavior,
  resolveCombinationFeatureTag,
  suggestCombinationOutput,
  type CombinationBehaviorDraft,
  type CombinationBehaviorRow,
  type CombinationBehaviorType,
} from 'src/lib/openTypeFeatures'

interface CombinationBehaviorTableRowProps {
  row?: CombinationBehaviorRow
  rowId?: string
  onCommit: (draft: CombinationBehaviorDraft) => void
  onDelete: () => void
  onDraftCommitted?: () => void
  onOpenGlyph: (glyphId: string) => void
}

export function CombinationBehaviorTableRow({
  row,
  rowId,
  onCommit,
  onDelete,
  onDraftCommitted,
  onOpenGlyph,
}: CombinationBehaviorTableRowProps) {
  const [input, setInput] = useState(row?.input ?? '')
  const [output, setOutput] = useState(row?.output ?? '')
  const [type, setType] = useState<CombinationBehaviorType>(
    row?.type ?? 'standardLigature'
  )
  const [customFeatureTag, setCustomFeatureTag] = useState(
    row?.type === 'customFeature' ? row.featureTag : ''
  )
  const [outputEdited, setOutputEdited] = useState(Boolean(row?.output))

  const draft: CombinationBehaviorDraft = {
    lookupId: row?.lookupId,
    ruleId: row?.ruleId,
    input,
    output,
    type,
    customFeatureTag,
  }
  const canCommit = canCommitCombinationBehavior(draft)

  const commit = () => {
    if (!canCommit) return
    onCommit(draft)
    onDraftCommitted?.()
  }

  const updateInput = (value: string) => {
    const shouldSuggestOutput =
      !outputEdited || output === suggestCombinationOutput(input)
    setInput(value)
    if (shouldSuggestOutput) {
      setOutput(suggestCombinationOutput(value))
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
          aria-label="Combination input sequence"
          value={input}
          size="xs"
          placeholder="f+t"
          onBlur={commit}
          onChange={(event) => updateInput(event.target.value)}
          onKeyDown={commitOnEnter}
        />
        <NavArrowRight width={14} height={14} aria-hidden="true" />
        <Input
          aria-label="Combination output glyph"
          value={output}
          size="xs"
          placeholder="f_t"
          onBlur={commit}
          onChange={(event) => {
            setOutputEdited(true)
            setOutput(event.target.value)
          }}
          onKeyDown={commitOnEnter}
        />
        <Tooltip label="Open output glyph">
          <IconButton
            aria-label="開啟 output glyph"
            icon={<NavArrowRight width={15} height={15} aria-hidden="true" />}
            size="xs"
            variant="ghost"
            isDisabled={!output}
            onClick={() => onOpenGlyph(output)}
          />
        </Tooltip>
        <Tooltip label="Delete behavior">
          <IconButton
            aria-label="刪除 combination"
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
          aria-label="Combination behavior type"
          value={type}
          size="xs"
          onBlur={commit}
          onChange={(event) => {
            const nextType = event.target.value as CombinationBehaviorType
            setType(nextType)
            if (nextType !== 'customFeature') {
              setCustomFeatureTag('')
            }
          }}
        >
          {COMBINATION_BEHAVIOR_TYPES.map((behaviorType) => (
            <option key={behaviorType} value={behaviorType}>
              {COMBINATION_BEHAVIOR_TYPE_LABELS[behaviorType]}
            </option>
          ))}
        </Select>
        {type === 'customFeature' ? (
          <Input
            aria-label="Custom feature tag"
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
              {resolveCombinationFeatureTag(draft) || 'tag'}
            </Badge>
          ) : null}
        </HStack>
        <HStack spacing={1} wrap="wrap" justify="flex-end">
          {row?.status.map((status) => (
            <Badge key={status} colorScheme="red">
              {status}
            </Badge>
          ))}
          {!canCommit && (input || output) ? (
            <Badge colorScheme="red">Invalid Input</Badge>
          ) : null}
        </HStack>
      </HStack>
    </Stack>
  )
}
