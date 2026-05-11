import { Badge, Box, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import type {
  AlternateBehaviorRow,
  CombinationBehaviorRow,
  SpacingBehaviorRow,
} from 'src/lib/openTypeFeatures'

interface BehaviorPreviewPanelProps {
  alternates: AlternateBehaviorRow[]
  combinations: CombinationBehaviorRow[]
  currentGlyphId: string
  spacing: SpacingBehaviorRow[]
}

interface PreviewResult {
  output: string
  applied: string[]
}

export function BehaviorPreviewPanel({
  alternates,
  combinations,
  currentGlyphId,
  spacing,
}: BehaviorPreviewPanelProps) {
  const [input, setInput] = useState(() =>
    combinations[0]?.input ? combinations[0].input : currentGlyphId
  )
  const result = useMemo(
    () => previewBehaviorInput(input, combinations, alternates),
    [alternates, combinations, input]
  )
  const spacingMatches = useMemo(
    () => previewSpacingInput(input, spacing),
    [input, spacing]
  )
  const applied = [...result.applied, ...spacingMatches]

  return (
    <Box
      borderWidth="1px"
      borderColor="field.line"
      bg="field.panel"
      position="sticky"
      bottom={0}
      zIndex={1}
    >
      <Stack spacing={2} p={3}>
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="semibold">
            Preview
          </Text>
          <Badge colorScheme={applied.length > 0 ? 'green' : 'gray'}>
            {applied.length}
          </Badge>
        </HStack>
        <Input
          aria-label="Behavior preview input"
          size="xs"
          fontFamily="mono"
          value={input}
          placeholder="f+i"
          onChange={(event) => setInput(event.target.value)}
        />
        <Box
          minH={8}
          px={2}
          py={1}
          bg="field.panelMuted"
          borderRadius="2px"
          fontFamily="mono"
          fontSize="sm"
        >
          {result.output || ' '}
        </Box>
        <HStack spacing={1} wrap="wrap">
          {applied.length > 0 ? (
            applied.map((label) => (
              <Badge key={label} colorScheme="green">
                {label}
              </Badge>
            ))
          ) : (
            <Text fontSize="xs" color="field.muted">
              No behaviors applied.
            </Text>
          )}
        </HStack>
      </Stack>
    </Box>
  )
}

function previewSpacingInput(input: string, spacing: SpacingBehaviorRow[]) {
  const tokens = parsePreviewTokens(input)
  const applied: string[] = []
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const row = spacing.find(
      (candidate) =>
        candidate.left === tokens[index] &&
        candidate.right === tokens[index + 1]
    )
    if (row) {
      applied.push(`kern ${row.value}`)
    }
  }
  return applied
}

function previewBehaviorInput(
  input: string,
  combinations: CombinationBehaviorRow[],
  alternates: AlternateBehaviorRow[]
): PreviewResult {
  const tokens = parsePreviewTokens(input)
  const applied: string[] = []
  const output: string[] = []
  const sortedCombinations = [...combinations].sort(
    (left, right) =>
      parsePreviewTokens(right.input).length -
      parsePreviewTokens(left.input).length
  )

  for (let index = 0; index < tokens.length; ) {
    const combination = sortedCombinations.find((row) => {
      const inputTokens = parsePreviewTokens(row.input)
      return inputTokens.every(
        (token, offset) => tokens[index + offset] === token
      )
    })

    if (combination) {
      output.push(combination.output)
      applied.push(combination.featureTag)
      index += parsePreviewTokens(combination.input).length
      continue
    }

    const alternate = alternates.find((row) => row.source === tokens[index])
    if (alternate) {
      output.push(alternate.alternate)
      applied.push(alternate.featureTag)
      index += 1
      continue
    }

    output.push(tokens[index] ?? '')
    index += 1
  }

  return {
    output: output.join('+'),
    applied: [...new Set(applied)],
  }
}

function parsePreviewTokens(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return []
  if (trimmed.includes('+')) {
    return trimmed
      .split('+')
      .map((token) => token.trim())
      .filter(Boolean)
  }
  return [...trimmed]
}
