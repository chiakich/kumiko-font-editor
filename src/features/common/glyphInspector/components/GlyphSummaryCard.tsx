import { Box, Button, Grid, GridItem, Stack, Tag, Text } from '@chakra-ui/react'
import { NativeSelect } from '@/components/ui/native-select'
import { GlyphColorLabelPicker } from 'src/features/common/glyphInspector/components/GlyphColorLabelPicker'
import {
  getGlyphBlockLabel,
  getGlyphDisplayCharacter,
  getGlyphOverviewStats,
  getGlyphScriptLabel,
} from 'src/lib/glyph/glyphOverview'
import { getPrimaryGlyphUnicode } from 'src/lib/glyph/glyphUnicode'
import type {
  GlyphData,
  GlyphLayerData,
  KumikoColor,
  WorkspaceView,
} from 'src/store'
import { useTranslation } from 'react-i18next'
import { PageSearch } from 'iconoir-react'

interface GlyphSummaryCardProps {
  activeLayer: GlyphLayerData | null
  availableLayers: Array<{ id: string; name: string }>
  glyph: GlyphData
  isDirty: boolean
  workspaceView: WorkspaceView
  // The editor uses a dedicated LayerListCard instead of this inline select.
  showLayerSelect?: boolean
  onDeleteGlyph: () => void
  onEnterEditor: () => void
  onGlyphColorChange: (color: KumikoColor | null) => void
  onOpenQualityCheck?: () => void
  onLayerChange: (layerId: string) => void
}

export function GlyphSummaryCard({
  activeLayer,
  availableLayers,
  glyph,
  isDirty,
  workspaceView,
  showLayerSelect = true,
  onDeleteGlyph,
  onEnterEditor,
  onGlyphColorChange,
  onOpenQualityCheck,
  onLayerChange,
}: GlyphSummaryCardProps) {
  const { t } = useTranslation()

  const overviewStats = getGlyphOverviewStats(glyph)
  const glyphDisplayCharacter = getGlyphDisplayCharacter(glyph)

  return (
    <Box
      p={4}
      bg="card"
      borderRadius="sm"
      boxShadow="inset 0 6px 0 rgba(247, 235, 64, 0.9)"
    >
      <Stack gap={2}>
        <Text
          fontWeight="900"
          color="foreground"
          fontSize="3xl"
          lineHeight="0.88"
          pt={2}
        >
          {glyph.name}
        </Text>
        <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
          {glyph.id}
        </Text>
        {workspaceView === 'overview' && (
          <Box
            mt={1}
            px={3}
            py={4}
            borderRadius="sm"
            bg="background"
            textAlign="center"
          >
            <Text
              fontSize={glyphDisplayCharacter ? '8xl' : '4xl'}
              lineHeight={0.82}
              color="foreground"
              fontWeight="900"
            >
              {glyphDisplayCharacter ?? glyph.name}
            </Text>
          </Box>
        )}
        <Stack direction="row" gap={1} align="center">
          <Tag.Root
            fontSize="xs"
            colorPalette={isDirty ? 'orange' : 'green'}
            variant="subtle"
          >
            {isDirty ? '等待本機儲存' : '已同步到本機'}
          </Tag.Root>
        </Stack>
        <GlyphColorLabelPicker
          value={glyph.color}
          onChange={onGlyphColorChange}
        />
        {showLayerSelect && availableLayers.length > 0 && (
          <Box>
            <Text
              fontSize="xs"
              color="mutedForeground"
              mb={1}
              fontFamily="mono"
            >
              {t('glyphInspector.layerMaster')}
            </Text>
            <NativeSelect
              size="sm"
              fieldProps={{
                value: activeLayer?.id ?? '',
                onChange: (event) => onLayerChange(event.target.value),
              }}
            >
              {availableLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name || layer.id}
                </option>
              ))}
            </NativeSelect>
          </Box>
        )}
        {workspaceView === 'overview' && (
          <>
            <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
              <GridItem>
                <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
                  {t('glyphInspector.unicode')}
                </Text>
                <Text fontSize="sm" color="foreground" fontFamily="mono">
                  {getPrimaryGlyphUnicode(glyph) ?? '未編碼'}
                </Text>
              </GridItem>
              <GridItem>
                <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
                  {t('glyphInspector.script')}
                </Text>
                <Text fontSize="sm" color="foreground">
                  {getGlyphScriptLabel(glyph)}
                </Text>
              </GridItem>
              <GridItem>
                <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
                  {t('glyphInspector.block')}
                </Text>
                <Text fontSize="sm" color="foreground">
                  {getGlyphBlockLabel(glyph)}
                </Text>
              </GridItem>
              <GridItem>
                <Text fontSize="xs" color="mutedForeground" fontFamily="mono">
                  {t('glyphInspector.contoursComponents')}
                </Text>
                <Text fontSize="sm" color="foreground" fontFamily="mono">
                  {overviewStats?.contourCount ?? 0} /{' '}
                  {overviewStats?.componentCount ?? 0}
                </Text>
              </GridItem>
            </Grid>
            <Button size="sm" onClick={onEnterEditor}>
              {t('glyphInspector.enterGlyphEditor')}
            </Button>
            {onOpenQualityCheck ? (
              <Button size="sm" variant="outline" onClick={onOpenQualityCheck}>
                <PageSearch width={14} height={14} />
                {t('qualityCheck.title')}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onDeleteGlyph}>
              {t('glyphInspector.deleteGlyph')}
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
