import { Box, Stack, Text, Textarea } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGlyphUnicodeChar } from 'src/lib/glyph/glyphUnicode'
import { useStore, type FontData } from 'src/store'
import { KerningCard } from 'src/features/editor/rightPanel/kerning/KerningPairInspector'

const DEFAULT_WORD_LIST = [
  'AVAWAYAT',
  'LTLYLVLA',
  'ToTaTeTiTrTy',
  'FaPaVaWaYa',
  'r.r,y.y,f.f,',
].join('\n')

interface KerningWordListProps {
  fontData: FontData
}

export function KerningWordList({ fontData }: KerningWordListProps) {
  const { t } = useTranslation()
  const setEditorTextState = useStore((state) => state.setEditorTextState)
  const [wordListInput, setWordListInput] = useState(DEFAULT_WORD_LIST)

  const glyphIdByCharacter = useMemo(() => {
    const map = new Map<string, string>()
    for (const glyph of Object.values(fontData.glyphs)) {
      const char = getGlyphUnicodeChar(glyph)
      if (char && !map.has(char)) {
        map.set(char, glyph.id)
      }
    }
    return map
  }, [fontData.glyphs])

  const lines = wordListInput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const loadLine = (line: string) => {
    const glyphIds: string[] = []
    const chars: string[] = []
    for (const char of line) {
      const glyphId = glyphIdByCharacter.get(char)
      if (!glyphId) continue
      glyphIds.push(glyphId)
      chars.push(char)
    }
    if (glyphIds.length < 2) return
    setEditorTextState(chars.join(''), glyphIds, 2, 1)
  }

  return (
    <KerningCard title={t('editor.kerningWordList')}>
      <Stack gap={2} px={3} py={2}>
        <Textarea
          size="xs"
          rows={3}
          value={wordListInput}
          fontFamily="mono"
          onChange={(event) => setWordListInput(event.target.value)}
        />
        <Text fontSize="10px" color="mutedForeground">
          {t('editor.kerningWordListHint')}
        </Text>
        <Stack gap={1}>
          {lines.map((line, index) => {
            const coverage = [...line].filter((char) =>
              glyphIdByCharacter.has(char)
            ).length
            const isLoadable = coverage >= 2
            return (
              <Box
                key={`${index}-${line}`}
                px={2}
                py={1}
                borderWidth="1px"
                borderColor="border"
                cursor={isLoadable ? 'pointer' : 'not-allowed'}
                opacity={isLoadable ? 1 : 0.45}
                _hover={isLoadable ? { bg: 'muted' } : undefined}
                onClick={() => isLoadable && loadLine(line)}
              >
                <Text fontSize="sm" fontFamily="mono" truncate>
                  {line}
                </Text>
              </Box>
            )
          })}
        </Stack>
      </Stack>
    </KerningCard>
  )
}
