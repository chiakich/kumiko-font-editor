import { Box, HStack, Input, Stack, Text } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'
import type { FontData } from 'src/store'
import { GlyphPreview } from 'src/features/common/glyphPreview/GlyphPreview'
import { useOpenGlyphInEditor } from 'src/features/editor/rightPanel/behaviors/useOpenBehaviorGlyphs'

interface SubstitutionGridViewProps {
  state: OpenTypeFeaturesState
  lookupIds: readonly string[]
  fontData: FontData
}

interface GridEntry {
  from: string
  to: string
}

const CELLS_PER_ROW = 5

// Every glyph a one-to-one substitution feature touches, before → after. This
// is the native reading of vert / ssXX / smcp-style features: not a text run,
// a proof sheet of the whole mapping.
export function SubstitutionGridView({
  state,
  lookupIds,
  fontData,
}: SubstitutionGridViewProps) {
  const { t } = useTranslation()
  const openGlyphInEditor = useOpenGlyphInEditor()
  const [filter, setFilter] = useState('')

  const entries = useMemo(() => {
    const lookupById = new Map(
      state.lookups.map((lookup) => [lookup.id, lookup])
    )
    const classById = new Map(
      state.glyphClasses.map((glyphClass) => [glyphClass.id, glyphClass])
    )
    const collected: GridEntry[] = []
    const seen = new Set<string>()
    const push = (from: string, to: string) => {
      const key = `${from}→${to}`
      if (!seen.has(key)) {
        seen.add(key)
        collected.push({ from, to })
      }
    }
    for (const lookupId of lookupIds) {
      for (const rule of lookupById.get(lookupId)?.rules ?? []) {
        if (rule.kind !== 'singleSubstitution') {
          continue
        }
        if (rule.target.kind === 'glyph') {
          push(rule.target.glyph, rule.replacement)
        } else {
          for (const member of classById.get(rule.target.classId)?.glyphs ??
            []) {
            push(member, rule.replacement)
          }
        }
      }
    }
    const query = filter.trim().toLowerCase()
    return query
      ? collected.filter(
          (entry) =>
            entry.from.toLowerCase().includes(query) ||
            entry.to.toLowerCase().includes(query)
        )
      : collected
  }, [state, lookupIds, filter])

  const rows = useMemo(() => {
    const chunked: GridEntry[][] = []
    for (let index = 0; index < entries.length; index += CELLS_PER_ROW) {
      chunked.push(entries.slice(index, index + CELLS_PER_ROW))
    }
    return chunked
  }, [entries])

  if (entries.length === 0 && !filter) {
    return (
      <Text fontSize="xs" color="mutedForeground">
        {t('projectControl.substitutionGridEmpty')}
      </Text>
    )
  }

  return (
    <Stack gap={2} flex={1} minH={0}>
      <HStack gap={2}>
        <Input
          size="xs"
          maxW="260px"
          fontFamily="mono"
          value={filter}
          placeholder={t('projectControl.ruleTableFilter')}
          onChange={(event) => setFilter(event.target.value)}
        />
        <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
          {t('projectControl.substitutionGridCount', {
            count: entries.length,
          })}
        </Text>
      </HStack>
      <Box height="460px">
        <Virtuoso
          style={{ height: '100%' }}
          totalCount={rows.length}
          itemContent={(rowIndex) => {
            const row = rows[rowIndex]
            if (!row) {
              return null
            }
            return (
              <HStack gap={3} py={1.5} align="stretch">
                {row.map((entry) => {
                  const fromGlyph = fontData.glyphs[entry.from]
                  const toGlyph = fontData.glyphs[entry.to]
                  return (
                    <Stack
                      key={`${entry.from}→${entry.to}`}
                      as="button"
                      gap={1}
                      p={2}
                      borderWidth="1px"
                      borderColor="controlBorder"
                      borderRadius="md"
                      bg="card"
                      cursor={toGlyph ? 'pointer' : 'default'}
                      onClick={() => toGlyph && openGlyphInEditor(entry.to)}
                      width="170px"
                      flexShrink={0}
                    >
                      <HStack gap={1.5} justify="center">
                        <Box width="52px" height="52px" opacity={0.5}>
                          {fromGlyph ? (
                            <GlyphPreview
                              glyph={fromGlyph}
                              glyphMap={fontData.glyphs}
                            />
                          ) : (
                            <Text fontSize="xs" color="mutedForeground">
                              ?
                            </Text>
                          )}
                        </Box>
                        <Text color="mutedForeground" fontSize="xs">
                          →
                        </Text>
                        <Box width="52px" height="52px">
                          {toGlyph ? (
                            <GlyphPreview
                              glyph={toGlyph}
                              glyphMap={fontData.glyphs}
                            />
                          ) : (
                            <Text
                              fontSize="xs"
                              color="orange.500"
                              fontFamily="mono"
                            >
                              {t('projectControl.substitutionGridMissing')}
                            </Text>
                          )}
                        </Box>
                      </HStack>
                      <Text
                        fontSize="9px"
                        fontFamily="mono"
                        color="mutedForeground"
                        lineClamp={1}
                        textAlign="center"
                      >
                        {entry.from} → {entry.to}
                      </Text>
                    </Stack>
                  )
                })}
              </HStack>
            )
          }}
        />
      </Box>
    </Stack>
  )
}
