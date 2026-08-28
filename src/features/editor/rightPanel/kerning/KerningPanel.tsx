import { Button, Stack, Text } from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { useStore, type FontData } from 'src/store'
import { KerningPairInspector } from 'src/features/editor/rightPanel/kerning/KerningPairInspector'
import { KerningPairList } from 'src/features/editor/rightPanel/kerning/KerningPairList'
import { KerningGroupManager } from 'src/features/editor/rightPanel/kerning/KerningGroupManager'
import { KerningWordList } from 'src/features/editor/rightPanel/kerning/KerningWordList'
import { KerningValidationCard } from 'src/features/editor/rightPanel/kerning/KerningValidationCard'

interface KerningPanelProps {
  fontData: FontData | null
}

export function KerningPanel({ fontData }: KerningPanelProps) {
  const { t } = useTranslation()
  const requestFeatureWorkspace = useStore(
    (state) => state.requestFeatureWorkspace
  )

  if (!fontData) {
    return (
      <Text fontSize="sm" color="mutedForeground" fontFamily="mono">
        {t('editor.noGlyphSelected')}
      </Text>
    )
  }

  return (
    <Stack gap={4}>
      <Button
        size="2xs"
        variant="outline"
        alignSelf="flex-start"
        onClick={() => requestFeatureWorkspace({ kind: 'kern' })}
      >
        {t('editor.openInFeatureWorkspace')}
      </Button>
      <KerningPairInspector fontData={fontData} />
      <KerningValidationCard fontData={fontData} />
      <KerningPairList fontData={fontData} />
      <KerningGroupManager fontData={fontData} />
      <KerningWordList fontData={fontData} />
    </Stack>
  )
}
