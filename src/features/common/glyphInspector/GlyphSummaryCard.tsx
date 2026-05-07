import {
  Box,
  Button,
  Grid,
  GridItem,
  Select,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import {
  getGlyphBlockLabel,
  getGlyphDisplayCharacter,
  getGlyphOverviewStats,
  getGlyphScriptLabel,
} from 'src/lib/glyphOverview'
import type { GlyphData, GlyphLayerData, WorkspaceView } from 'src/store'

interface GlyphSummaryCardProps {
  activeLayer: GlyphLayerData | null
  availableLayers: Array<{ id: string; name: string }>
  glyph: GlyphData
  isDirty: boolean
  selectedLayerId: string | null
  workspaceView: WorkspaceView
  onDeleteGlyph: () => void
  onEnterEditor: () => void
  onLayerChange: (layerId: string) => void
}

export function GlyphSummaryCard({
  activeLayer,
  availableLayers,
  glyph,
  isDirty,
  selectedLayerId,
  workspaceView,
  onDeleteGlyph,
  onEnterEditor,
  onLayerChange,
}: GlyphSummaryCardProps) {
  const overviewStats = getGlyphOverviewStats(glyph)
  const glyphDisplayCharacter = getGlyphDisplayCharacter(glyph)

  return (
    <Box
      p={4}
      bg="field.panel"
      borderRadius="sm"
      boxShadow="inset 0 6px 0 rgba(247, 235, 64, 0.9)"
    >
      <Stack spacing={2}>
        <Text
          fontWeight="900"
          color="field.ink"
          fontSize="3xl"
          lineHeight="0.88"
          pt={2}
        >
          {glyph.name}
        </Text>
        <Text fontSize="xs" color="field.muted" fontFamily="mono">
          {glyph.id}
        </Text>
        {workspaceView === 'overview' && (
          <Box
            mt={1}
            px={3}
            py={4}
            borderRadius="sm"
            bg="field.paper"
            textAlign="center"
          >
            <Text
              fontSize={glyphDisplayCharacter ? '8xl' : '4xl'}
              lineHeight={0.82}
              color="field.ink"
              fontWeight="900"
            >
              {glyphDisplayCharacter ?? glyph.name}
            </Text>
          </Box>
        )}
        <Stack direction="row" spacing={1} align="center">
          <Tag alignSelf="start" colorScheme="cyan" variant="subtle">
            Layer {selectedLayerId ?? activeLayer?.id ?? 'default'}
          </Tag>
          <Tag
            fontSize="xs"
            colorScheme={isDirty ? 'orange' : 'green'}
            variant="subtle"
          >
            {isDirty ? '未儲存' : '已儲存'}
          </Tag>
        </Stack>
        {availableLayers.length > 0 && (
          <Box>
            <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
              圖層 / Master
            </Text>
            <Select
              size="sm"
              value={activeLayer?.id ?? ''}
              onChange={(event) => onLayerChange(event.target.value)}
            >
              {availableLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.name || layer.id}
                </option>
              ))}
            </Select>
          </Box>
        )}
        {workspaceView === 'overview' && (
          <>
            <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
              <GridItem>
                <Text fontSize="xs" color="field.muted" fontFamily="mono">
                  Unicode
                </Text>
                <Text fontSize="sm" color="field.ink" fontFamily="mono">
                  {glyph.unicode ?? '未編碼'}
                </Text>
              </GridItem>
              <GridItem>
                <Text fontSize="xs" color="field.muted" fontFamily="mono">
                  Script
                </Text>
                <Text fontSize="sm" color="field.ink">
                  {getGlyphScriptLabel(glyph)}
                </Text>
              </GridItem>
              <GridItem>
                <Text fontSize="xs" color="field.muted" fontFamily="mono">
                  Block
                </Text>
                <Text fontSize="sm" color="field.ink">
                  {getGlyphBlockLabel(glyph)}
                </Text>
              </GridItem>
              <GridItem>
                <Text fontSize="xs" color="field.muted" fontFamily="mono">
                  Contours / Components
                </Text>
                <Text fontSize="sm" color="field.ink" fontFamily="mono">
                  {overviewStats?.contourCount ?? 0} /{' '}
                  {overviewStats?.componentCount ?? 0}
                </Text>
              </GridItem>
            </Grid>
            <Button size="sm" onClick={onEnterEditor}>
              進入字符編輯器
            </Button>
            <Button size="sm" variant="outline" onClick={onDeleteGlyph}>
              刪除字符
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
